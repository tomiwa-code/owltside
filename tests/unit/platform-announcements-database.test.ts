// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const migration = readFileSync('supabase/sql/031_platform_announcements.sql', 'utf8');
const users = [randomUUID(), randomUUID(), randomUUID()];

async function asRole(role: 'postgres' | 'service_role' | 'authenticated' | 'anon', uid = '') {
	await db.exec(`set role ${role};`);
	await db.query(
		"select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)",
		[role, uid]
	);
}

async function send(title = 'Community update', body = 'A message for everybody.') {
	return db.query<{
		announcement_id: string;
		title: string;
		body: string;
		recipient_count: number;
		sent_by: string;
	}>('select * from public.send_platform_announcement($1, $2, $3)', [title, body, 'Platform Admin']);
}

beforeAll(async () => {
	await db.exec(`
		create role anon;
		create role authenticated;
		create role service_role bypassrls;
		create schema auth;
		create function auth.uid() returns uuid language sql stable as $$
		  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
		$$;
		create function auth.role() returns text language sql stable as $$
		  select current_setting('request.jwt.claim.role', true)
		$$;
		create table public.profiles (id uuid primary key);
		create table public.notifications (
		  id uuid primary key default gen_random_uuid(),
		  user_id uuid not null references public.profiles(id) on delete cascade,
		  kind text not null,
		  title text not null,
		  body text not null,
		  at timestamptz not null default now(),
		  read boolean not null default false
		);
		grant usage on schema public, auth to anon, authenticated, service_role;
		grant select on table public.notifications to service_role;
	`);
	await db.exec(migration);
	for (const id of users) await db.query('insert into public.profiles values ($1)', [id]);
}, 30_000);

beforeEach(async () => {
	await asRole('postgres');
	await db.exec('truncate public.notifications, public.platform_announcements;');
});

afterAll(async () => { await db.close(); });

describe('database-enforced platform announcements', () => {
	it('atomically records one send and delivers an unread announcement to every public profile', async () => {
		await asRole('service_role');
		const { rows } = await send('  Community update  ', '  A message for everybody.  ');
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			title: 'Community update',
			body: 'A message for everybody.',
			recipient_count: users.length,
			sent_by: 'Platform Admin'
		});

		const notices = await db.query<{
			user_id: string;
			kind: string;
			title: string;
			body: string;
			read: boolean;
		}>('select user_id, kind, title, body, read from public.notifications');
		expect(notices.rows).toHaveLength(users.length);
		expect(new Set(notices.rows.map((notice) => notice.user_id))).toEqual(new Set(users));
		for (const notice of notices.rows) {
			expect(notice).toMatchObject({
				kind: 'announcement',
				title: 'Announcement · Community update',
				body: 'A message for everybody.',
				read: false
			});
		}
		expect((await db.query('select id from public.platform_announcements')).rows).toHaveLength(1);
	});

	it('cannot be called or read by public app roles', async () => {
		for (const role of ['authenticated', 'anon'] as const) {
			await asRole(role, role === 'authenticated' ? users[0] : '');
			await expect(send()).rejects.toThrow(/permission denied/);
			await expect(db.query('select id from public.platform_announcements')).rejects.toThrow(/permission denied/);
		}
		await asRole('postgres');
		expect((await db.query('select id from public.notifications')).rows).toHaveLength(0);
	});

	it('validates content and rolls back the send record if any notification fails', async () => {
		await asRole('service_role');
		await expect(send(' ', 'Message')).rejects.toThrow(/title/i);
		await expect(send('Title', ' ')).rejects.toThrow(/message/i);

		await asRole('postgres');
		await db.exec("alter table public.notifications add constraint test_announcement_failure check (body not like '%block delivery%')");
		await asRole('service_role');
		await expect(send('Valid title', 'block delivery')).rejects.toThrow(/test_announcement_failure/);
		expect((await db.query('select id from public.platform_announcements')).rows).toHaveLength(0);
		expect((await db.query('select id from public.notifications')).rows).toHaveLength(0);
		await asRole('postgres');
		await db.exec('alter table public.notifications drop constraint test_announcement_failure');
	});

	it('is rerunnable and included unchanged in the full-schema install', async () => {
		await asRole('postgres');
		await db.exec(migration);
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration);
		await asRole('service_role');
		expect((await send()).rows[0].recipient_count).toBe(users.length);
	});
});

// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Exercise the real SQL, RLS and RPC privileges in PostgreSQL rather than only
// asserting strings in a migration. Supabase's JWT helpers are stubbed locally.
const db = new PGlite();
const migration = readFileSync('supabase/sql/030_admin_verification_lifecycle.sql', 'utf8');
let userId: string;

async function asRole(role: 'postgres' | 'service_role' | 'authenticated' | 'anon', uid = '') {
	await db.exec(`set role ${role};`);
	await db.query("select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)", [role, uid]);
}
async function submit(check: string, status = 'pending', overrides: Record<string, unknown> = {}) {
	const { rows } = await db.query<{ id: string }>(
		`insert into public.approval_requests (requester_id, kind, status, title, payload)
		 values ($1, 'verification', $2, 'Verification', $3::jsonb) returning id`,
		[userId, status, JSON.stringify({ check, ...overrides })]
	);
	return rows[0].id;
}
async function approve(id: string) {
	await asRole('service_role');
	await db.query("update public.approval_requests set status = 'approved' where id = $1 and status = 'pending'", [id]);
}
async function seedApproved() {
	await asRole('service_role');
	const identity = await submit('identity');
	await approve(identity);
	const payout = await submit('payoutAccount', 'pending', { bank: 'GTBank', accountNumber: '0123456789' });
	await approve(payout);
	return { identity, payout };
}
async function requestAgain(check = 'identity', reason = 'Upload a current document.') {
	const { rows } = await db.query<{ id: string }>(
		'select public.request_user_reverification($1, $2, $3, $4) as id',
		[userId, check, reason, 'Review Admin']
	);
	return rows[0].id;
}
async function profileVerified() {
	return (await db.query<{ verified: boolean }>('select verified from public.profiles where id = $1', [userId])).rows[0].verified;
}

beforeAll(async () => {
	await db.exec(`
		create role anon;
		create role authenticated;
		create role service_role bypassrls;
		create schema auth;
		create table auth.users (id uuid primary key);
		create function auth.uid() returns uuid language sql stable as $$
		  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
		$$;
		create function auth.role() returns text language sql stable as $$
		  select current_setting('request.jwt.claim.role', true)
		$$;
		create table public.profiles (id uuid primary key references auth.users(id), verified boolean not null default false);
		create table public.events (id uuid primary key, organizer_id uuid, status text, starts_at timestamptz, ends_at timestamptz);
		create table public.tickets (id uuid primary key, status text);
		create table public.notifications (id uuid default gen_random_uuid(), user_id uuid, kind text, title text, body text, href text);
	`);
	await db.exec(readFileSync('supabase/sql/023_approval_requests.sql', 'utf8'));
	await db.exec(readFileSync('supabase/sql/029_payout_lifecycle.sql', 'utf8'));
	await db.exec(migration);
	await db.exec(`
		grant usage on schema public, auth to anon, authenticated, service_role;
		grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
	`);
}, 30_000);

beforeEach(async () => {
	await asRole('postgres');
	userId = randomUUID();
	await db.query('insert into auth.users values ($1)', [userId]);
	await db.query('insert into public.profiles (id) values ($1)', [userId]);
});

afterAll(async () => { await db.close(); });

describe('database-enforced verification lifecycle', () => {
	it('accepts phone details only as pending and refuses self-approval or a second approved submission', async () => {
		await asRole('authenticated', userId);
		const phoneId = await submit('phone', 'pending', { phone: '+2348031234567' });
		expect((await db.query<{ status: string }>('select status from approval_requests where id = $1', [phoneId])).rows[0].status).toBe('pending');
		// There is no update policy for public callers.
		await db.query("update approval_requests set status = 'approved' where id = $1", [phoneId]);
		expect((await db.query<{ status: string }>('select status from approval_requests where id = $1', [phoneId])).rows[0].status).toBe('pending');
		await expect(submit('phone')).rejects.toThrow(/already awaiting approval/);
		await approve(phoneId);
		await asRole('authenticated', userId);
		await expect(submit('phone')).rejects.toThrow(/Only an admin can request/);
	});

	it('does not trust public decision fields, timestamps or verification subject IDs', async () => {
		await asRole('authenticated', userId);
		const { rows } = await db.query<{ status: string; subject_id: string | null; decision_note: string | null; decided_by: string | null; created_at: Date }>(
			`insert into approval_requests (requester_id, kind, title, payload, created_at, subject_id, decision_note, decided_at, decided_by)
			 values ($1, 'verification', 'Phone', '{"check":"phone"}', '2099-01-01', 'another-subject', 'Approved', now(), 'Forged Admin') returning *`, [userId]
		);
		expect(rows[0]).toMatchObject({ status: 'pending', subject_id: null, decision_note: null, decided_by: null });
		expect(new Date(rows[0].created_at).getUTCFullYear()).not.toBe(2099);
		await expect(submit('identity', 'approved')).rejects.toThrow(/Only an Owltside admin/);
	});

	it('only allows the service role to request re-verification, never phone or unapproved checks', async () => {
		await seedApproved();
		for (const role of ['authenticated', 'anon'] as const) {
			await asRole(role, role === 'authenticated' ? userId : '');
			await expect(requestAgain()).rejects.toThrow(/permission denied/);
		}
		await asRole('authenticated', userId);
		await expect(submit('identity', 'reverification_required')).rejects.toThrow(/Only an Owltside admin/);
		await asRole('service_role');
		await expect(requestAgain('phone')).rejects.toThrow(/Choose identity or payout account/);
		await expect(requestAgain('identity', '   ')).rejects.toThrow(/Add a reason/);
	});

	it('atomically records an admin request, preserves history, revokes the tick and notifies the user', async () => {
		const { identity, payout } = await seedApproved();
		expect(await profileVerified()).toBe(true);
		const requiredId = await requestAgain();
		expect(await profileVerified()).toBe(false);
		const { rows } = await db.query<{ id: string; status: string; decided_by: string; decision_note: string }>('select * from approval_requests where requester_id = $1 order by created_at desc, id desc', [userId]);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({ id: requiredId, status: 'reverification_required', decided_by: 'Review Admin', decision_note: 'Upload a current document.' });
		expect(rows.find((r) => r.id === identity)?.status).toBe('approved');
		expect(rows.find((r) => r.id === payout)?.status).toBe('approved');
		const notices = await db.query<{ body: string; href: string }>("select body, href from notifications where user_id = $1 and title like '%updated details requested'", [userId]);
		expect(notices.rows).toHaveLength(1);
		expect(notices.rows[0]).toMatchObject({ body: expect.stringContaining('Upload a current document.'), href: '/settings?category=verification' });
		await expect(requestAgain()).rejects.toThrow(/already been requested/);
	});

	it('waits for new details and a new admin approval before restoring verification', async () => {
		await seedApproved();
		const requiredId = await requestAgain('payoutAccount');
		// The normal decision query cannot approve an action-required marker.
		await approve(requiredId);
		expect(await profileVerified()).toBe(false);
		await asRole('authenticated', userId);
		const pendingId = await submit('payoutAccount', 'pending', { bank: 'Zenith Bank', accountNumber: '9876543210' });
		await expect(submit('payoutAccount')).rejects.toThrow(/already awaiting approval/);
		await asRole('service_role');
		await expect(requestAgain('payoutAccount')).rejects.toThrow(/awaiting review/);
		expect(await profileVerified()).toBe(false);
		await approve(pendingId);
		expect(await profileVerified()).toBe(true);
		await asRole('authenticated', userId);
		await expect(submit('payoutAccount')).rejects.toThrow(/Only an admin can request/);
	});

	it('keeps a rejected resubmission unverified and permits a corrected submission', async () => {
		await seedApproved();
		await requestAgain();
		await asRole('authenticated', userId);
		const pendingId = await submit('identity');
		await asRole('service_role');
		await db.query("update approval_requests set status = 'rejected', decision_note = 'Unreadable document' where id = $1", [pendingId]);
		expect(await profileVerified()).toBe(false);
		await asRole('authenticated', userId);
		const retry = await submit('identity');
		await approve(retry);
		expect(await profileVerified()).toBe(true);
	});

	it('prevents a public profile edit from restoring verification after an admin request', async () => {
		await seedApproved();
		await requestAgain();
		await asRole('authenticated', userId);
		await expect(db.query('update profiles set verified = true where id = $1', [userId])).rejects.toThrow(/Only an Owltside admin/);
		expect(await profileVerified()).toBe(false);
		// A real resubmission can still update the mirror through the trusted trigger.
		const pendingId = await submit('identity');
		await approve(pendingId);
		expect(await profileVerified()).toBe(true);
	});

	it('rolls back the request and tick change if the user notification cannot be saved', async () => {
		await seedApproved();
		await asRole('postgres');
		await db.exec("alter table notifications add constraint test_notification_failure check (body not like '%force failure%')");
		await asRole('service_role');
		await expect(requestAgain('identity', 'force failure')).rejects.toThrow(/test_notification_failure/);
		expect(await profileVerified()).toBe(true);
		expect((await db.query('select id from approval_requests where requester_id = $1', [userId])).rows).toHaveLength(2);
		await asRole('postgres');
		await db.exec('alter table notifications drop constraint test_notification_failure');
	});

	it('cannot read or submit another account’s verification', async () => {
		await seedApproved();
		await asRole('authenticated', randomUUID());
		expect((await db.query('select id from approval_requests where requester_id = $1', [userId])).rows).toEqual([]);
		await expect(submit('phone')).rejects.toThrow(/only submit your own/);
	});

	it('is rerunnable and is included unchanged in the full-schema install', async () => {
		await seedApproved();
		await requestAgain();
		await asRole('postgres');
		await db.exec(migration);
		expect(await profileVerified()).toBe(false);
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration);
	});
});

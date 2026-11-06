// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const migration = readFileSync('supabase/sql/032_profile_admin_roles.sql', 'utf8');
const userA = randomUUID();
const userB = randomUUID();

async function asRole(role: 'postgres' | 'service_role' | 'authenticated' | 'anon', uid = '') {
	await db.exec(`set role ${role};`);
	await db.query(
		"select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)",
		[role, uid]
	);
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
		create table public.profiles (
		  id uuid primary key,
		  handle text not null unique,
		  name text not null,
		  avatar_url text,
		  bio text,
		  operating_identity text not null default 'attendee',
		  disabled boolean not null default false,
		  created_at timestamptz not null default now()
		);
		alter table public.profiles enable row level security;
		create policy profiles_select on public.profiles for select using (true);
		create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);
		create policy profiles_update on public.profiles for update using (auth.uid() = id);
		grant usage on schema public, auth to anon, authenticated, service_role;
		grant select, insert, update on table public.profiles to authenticated, service_role;
		grant select on table public.profiles to anon;
	`);
	await db.exec(migration);
}, 30_000);

beforeEach(async () => {
	await asRole('postgres');
	await db.exec('truncate public.profiles;');
	await db.query(
		"insert into public.profiles (id, handle, name) values ($1, 'founder', 'Founder'), ($2, 'member', 'Member')",
		[userA, userB]
	);
});

afterAll(async () => {
	await db.close();
});

describe('032_profile_admin_roles database migration & guards', () => {
	it('defaults every profile role to user and normalizes manual Table Editor edits such as "super admin"', async () => {
		const initial = await db.query<{ id: string; role: string }>(
			'select id, role from public.profiles order by handle'
		);
		expect(initial.rows.map((r) => r.role)).toEqual(['user', 'user']);

		// Simulate manual edits in Supabase Table Editor / SQL Editor (postgres role)
		for (const input of ['super admin', 'Super Admin', 'super_admin', 'SUPERADMIN']) {
			await db.query('update public.profiles set role = $1 where id = $2', [input, userA]);
			const res = await db.query<{ role: string }>('select role from public.profiles where id = $1', [userA]);
			expect(res.rows[0].role).toBe('superadmin');
		}

		await db.query("update public.profiles set role = 'Admin' where id = $1", [userB]);
		expect(
			(await db.query<{ role: string }>('select role from public.profiles where id = $1', [userB])).rows[0].role
		).toBe('admin');

		await expect(
			db.query("update public.profiles set role = 'moderator' where id = $1", [userB])
		).rejects.toThrow(/profiles_role_check/);
	});

	it('blocks authenticated and anon clients from escalating or altering their own role', async () => {
		await asRole('authenticated', userB);
		await expect(
			db.query("update public.profiles set role = 'admin' where id = $1", [userB])
		).rejects.toThrow(/Only an Owltside Super Admin can change user roles/);

		await expect(
			db.query("update public.profiles set role = 'superadmin' where id = $1", [userB])
		).rejects.toThrow(/Only an Owltside Super Admin can change user roles/);

		const newUserId = randomUUID();
		await asRole('authenticated', newUserId);
		await expect(
			db.query(
				"insert into public.profiles (id, handle, name, role) values ($1, 'attacker', 'Attacker', 'superadmin')",
				[newUserId]
			)
		).rejects.toThrow(/Only an Owltside Super Admin can change user roles/);
	});

	it('allows an existing superadmin to edit their profile and sign in on the main app without losing superadmin', async () => {
		await asRole('postgres');
		await db.query("update public.profiles set role = 'super admin' where id = $1", [userA]);

		// Normal profile edit on main app as authenticated user
		await asRole('authenticated', userA);
		await db.query("update public.profiles set bio = 'Nightlife curator' where id = $1", [userA]);

		// Main-app OAuth / hooks upsert on conflict (does not specify role)
		await db.query(
			`insert into public.profiles (id, handle, name, avatar_url)
			 values ($1, 'founder', 'Founder Updated', 'https://example.com/a.png')
			 on conflict (id) do update set name = excluded.name, avatar_url = excluded.avatar_url`,
			[userA]
		);

		const check = await db.query<{ role: string; bio: string; name: string }>(
			'select role, bio, name from public.profiles where id = $1',
			[userA]
		);
		expect(check.rows[0]).toEqual({
			role: 'superadmin',
			bio: 'Nightlife curator',
			name: 'Founder Updated'
		});
	});

	it('allows service_role (Admin console server) to assign and revoke admin roles', async () => {
		await asRole('service_role');
		await db.query("update public.profiles set role = 'admin' where id = $1", [userB]);
		expect(
			(await db.query<{ role: string }>('select role from public.profiles where id = $1', [userB])).rows[0].role
		).toBe('admin');

		await db.query("update public.profiles set role = 'user' where id = $1", [userB]);
		expect(
			(await db.query<{ role: string }>('select role from public.profiles where id = $1', [userB])).rows[0].role
		).toBe('user');
	});

	it('is rerunnable and included verbatim in 000_full_schema.sql', async () => {
		await asRole('postgres');
		await db.exec(migration);
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration.trim());
	});
});

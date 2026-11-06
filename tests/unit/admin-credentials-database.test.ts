// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite({ extensions: { pgcrypto } });
const bootstrap = readFileSync('supabase/sql/032_admin_accounts.sql', 'utf8');
const migration = readFileSync('supabase/sql/033_admin_account_credentials.sql', 'utf8');
const initialEmail = 'admin@owltside.com';
const password = 'new-private-password-2026';

async function account() {
	return (await db.query<{ user_id: string; work_email: string; security_password: null; session_version: number }>(
		'select user_id, work_email, security_password, session_version from public.admin_accounts'
	)).rows[0];
}
async function authUser() {
	return (await db.query<{ email: string; encrypted_password: string }>('select email, encrypted_password from auth.users where id = (select user_id from public.admin_accounts)')).rows[0];
}

beforeAll(async () => {
	await db.exec(`
		create role anon;
		create role authenticated;
		create role service_role bypassrls;
		create schema auth;
		create table auth.users (
			id uuid primary key, instance_id uuid, aud text, role text,
			email text unique, encrypted_password text, email_confirmed_at timestamptz,
			raw_app_meta_data jsonb, raw_user_meta_data jsonb,
			confirmation_token text, recovery_token text, email_change_token_new text,
			email_change text, email_change_token_current text, reauthentication_token text,
			created_at timestamptz, updated_at timestamptz
		);
		create table auth.identities (
			id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
			provider_id text not null, provider text not null, identity_data jsonb not null,
			created_at timestamptz, updated_at timestamptz, unique (provider_id, provider)
		);
		grant usage on schema public to anon, authenticated, service_role;
	`);
	await db.exec(bootstrap);
	await db.exec(migration);
}, 30_000);

beforeEach(async () => {
	await db.exec('reset role; truncate auth.users cascade;');
	await db.exec(bootstrap);
});
afterAll(async () => { await db.close(); });

describe('editable admin table credentials', () => {
	it('backfills the login email and never stores a readable password', async () => {
		expect(await account()).toMatchObject({ work_email: initialEmail, security_password: null, session_version: 1 });
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration);
	});

	it('updates Auth and the email identity, normalizes input, and preserves the Auth ID', async () => {
		const before = await account();
		const oldPassword = (await authUser()).encrypted_password;
		await db.query('update public.admin_accounts set work_email = $1', ['  NEW@EXAMPLE.COM  ']);
		expect(await account()).toEqual({ ...before, work_email: 'new@example.com', session_version: 2 });
		expect(await authUser()).toEqual({ email: 'new@example.com', encrypted_password: oldPassword });
		expect((await db.query('select identity_data->>\'email\' as email from auth.identities')).rows)
			.toEqual([{ email: 'new@example.com' }]);
	});

	it('hashes a password with real pgcrypto, clears the input even in RETURNING, and bumps session version', async () => {
		const oldHash = (await authUser()).encrypted_password;
		const { rows } = await db.query('update public.admin_accounts set security_password = $1 returning security_password', [password]);
		expect(rows).toEqual([{ security_password: null }]);
		expect(await account()).toMatchObject({ work_email: initialEmail, security_password: null, session_version: 2 });
		const user = await authUser();
		expect(user.encrypted_password).not.toBe(oldHash);
		expect(user.encrypted_password).not.toContain(password);
		const check = await db.query('select encrypted_password = extensions.crypt($1, encrypted_password) as matches from auth.users', [password]);
		expect(check.rows).toEqual([{ matches: true }]);
		const oldCheck = await db.query('select encrypted_password = extensions.crypt($1, encrypted_password) as matches from auth.users', ['owltside-admin-2026']);
		expect(oldCheck.rows).toEqual([{ matches: false }]);
	});

	it('supports email and password in a single atomic table save', async () => {
		await db.query('update public.admin_accounts set work_email = $1, security_password = $2', ['both@example.com', password]);
		expect(await account()).toMatchObject({ work_email: 'both@example.com', security_password: null, session_version: 2 });
		expect((await authUser()).email).toBe('both@example.com');
	});

	it.each(['', 'short', ' '.repeat(20), 'a'.repeat(73), '🔒'.repeat(19)])('rejects invalid passwords without persisting them or changing the email', async (invalid) => {
		const original = await authUser();
		await expect(db.query('update public.admin_accounts set work_email = $1, security_password = $2', ['other@example.com', invalid])).rejects.toThrow(/Security password must/);
		expect(await authUser()).toEqual(original);
		expect(await account()).toMatchObject({ work_email: initialEmail, security_password: null, session_version: 1 });
	});

	it.each(['', 'bad-address', 'a@b', 'name with space@example.com'])('rejects invalid email: %s', async (email) => {
		await expect(db.query('update public.admin_accounts set work_email = $1', [email])).rejects.toThrow(/valid work email/);
		expect((await authUser()).email).toBe(initialEmail);
	});

	it('does not steal an email already assigned to any other Auth user', async () => {
		await db.query('insert into auth.users (id, email) values ($1, $2)', [randomUUID(), 'taken@example.com']);
		await expect(db.exec("update public.admin_accounts set work_email = 'TAKEN@example.com'")).rejects.toThrow(/another Auth user/);
		expect((await account()).work_email).toBe(initialEmail);
	});

	it('keeps credentials untouched for role/name edits and prevents manual session-version rollback', async () => {
		const original = await authUser();
		await db.exec("update public.admin_accounts set name = 'New name', role = 'Read-only Auditor', session_version = 999");
		expect(await authUser()).toEqual(original);
		expect((await account()).session_version).toBe(1);
	});

	it('does not undo an email updated through Auth when an unrelated admin field is edited', async () => {
		await db.exec("update auth.users set email = 'auth-changed@example.com'");
		await db.exec("update public.admin_accounts set name = 'Renamed'");
		expect((await authUser()).email).toBe('auth-changed@example.com');
		expect(await account()).toMatchObject({ work_email: 'auth-changed@example.com', session_version: 2 });
	});

	it('denies public roles and lets the trusted service role reset credentials without direct Auth table grants', async () => {
		for (const role of ['anon', 'authenticated']) {
			await db.exec(`set role ${role}`);
			await expect(db.query('update public.admin_accounts set security_password = $1', [password])).rejects.toThrow(/permission denied/);
			await expect(db.exec('select * from public.admin_accounts')).rejects.toThrow(/permission denied/);
		}
		await db.exec('set role service_role');
		await db.query('update public.admin_accounts set security_password = $1', [password]);
		expect((await account()).security_password).toBeNull();
		await expect(db.exec('select encrypted_password from auth.users')).rejects.toThrow(/permission denied/);
	});

	it('rolls back Auth changes if any admin-row constraint fails after synchronization', async () => {
		const original = await authUser();
		await expect(db.query("update public.admin_accounts set name = '', work_email = 'rollback@example.com', security_password = $1", [password])).rejects.toThrow(/check constraint/);
		expect(await authUser()).toEqual(original);
		expect((await account()).session_version).toBe(1);
	});

	it('does not allow an existing admin record to be reassigned to another Auth user', async () => {
		const otherId = randomUUID();
		await db.query("insert into auth.users (id, email) values ($1, 'other@example.com')", [otherId]);
		await expect(db.query('update public.admin_accounts set user_id = $1', [otherId])).rejects.toThrow(/cannot be changed/);
	});

	it('is rerunnable without resetting the password or session version', async () => {
		await db.query('update public.admin_accounts set security_password = $1', [password]);
		const original = await authUser();
		await db.exec(migration);
		expect(await authUser()).toEqual(original);
		expect((await account()).session_version).toBe(2);
	});

	it('finds pgcrypto when an existing project has installed it in public', async () => {
		await db.exec('alter extension pgcrypto set schema public');
		try {
			await db.query('update public.admin_accounts set security_password = $1', [password]);
			expect((await account()).session_version).toBe(2);
		} finally {
			await db.exec('alter extension pgcrypto set schema extensions');
		}
	});
});

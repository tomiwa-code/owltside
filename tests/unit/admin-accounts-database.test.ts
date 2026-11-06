// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const migration = readFileSync('supabase/sql/032_admin_accounts.sql', 'utf8');
const userId = randomUUID();

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
			id uuid primary key,
			user_id uuid not null references auth.users(id) on delete cascade,
			provider_id text not null, provider text not null, identity_data jsonb not null,
			created_at timestamptz, updated_at timestamptz,
			unique (provider_id, provider)
		);
		grant usage on schema public to anon, authenticated, service_role;
	`);
	await db.exec(migration);
	await db.query('insert into auth.users (id) values ($1)', [userId]);
}, 30_000);

beforeEach(async () => {
	await db.exec('reset role; truncate auth.users cascade;');
	await db.query('insert into auth.users (id) values ($1)', [userId]);
});

afterAll(async () => { await db.close(); });

describe('database-enforced admin access list', () => {
	it('is rerunnable and included unchanged in all-in-one installs', async () => {
		await db.exec(migration);
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration);
		const { rows } = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'public.admin_accounts'::regclass");
		expect(rows[0].relrowsecurity).toBe(true);
	});

	it('bootstraps the confirmed default login with an email identity and Super Admin access', async () => {
		await db.exec(migration);
		const { rows } = await db.query<{
			id: string; email: string; encrypted_password: string; email_confirmed_at: string;
			role: string; tier: number; is_active: boolean;
		}>(`select u.id, u.email, u.encrypted_password, u.email_confirmed_at,
		         a.role, a.tier, a.is_active
		    from auth.users u join public.admin_accounts a on a.user_id = u.id
		   where u.email = 'admin@owltside.com'`);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ email: 'admin@owltside.com', role: 'Super Admin', tier: 0, is_active: true });
		expect(rows[0].email_confirmed_at).toBeTruthy();
		expect(rows[0].encrypted_password).toMatch(/^\$2b\$12\$/);
		expect(rows[0].encrypted_password).not.toContain('owltside-admin-2026');
		const identities = await db.query('select user_id, provider_id, provider, identity_data from auth.identities');
		expect(identities.rows).toEqual([{
			user_id: rows[0].id, provider_id: rows[0].id, provider: 'email',
			identity_data: { sub: rows[0].id, email: 'admin@owltside.com', email_verified: true, phone_verified: false }
		}]);
	});

	it('does not reset passwords or undo suspensions/demotions on rerun', async () => {
		await db.exec(migration);
		await db.exec(`update auth.users set encrypted_password = 'rotated-hash' where email = 'admin@owltside.com';
		              update public.admin_accounts set is_active = false, role = 'Read-only Auditor';`);
		await db.exec(migration);
		const users = await db.query("select encrypted_password from auth.users where email = 'admin@owltside.com'");
		expect(users.rows).toEqual([{ encrypted_password: 'rotated-hash' }]);
		expect((await db.query('select is_active, role, tier from public.admin_accounts')).rows)
			.toEqual([{ is_active: false, role: 'Read-only Auditor', tier: 3 }]);
		expect((await db.query('select id from auth.identities')).rows).toHaveLength(1);
	});

	it('reuses an existing email case-insensitively without replacing credentials', async () => {
		await db.query(`insert into auth.users (id, email, encrypted_password)
		               values ($1, 'ADMIN@OWLTSIDE.COM', 'existing-password-hash')`, [randomUUID()]);
		await db.exec(migration);
		const { rows } = await db.query(`select u.encrypted_password, u.email_confirmed_at, a.role
		                                from auth.users u join public.admin_accounts a on a.user_id = u.id`);
		expect(rows).toEqual([{ encrypted_password: 'existing-password-hash', email_confirmed_at: null, role: 'Super Admin' }]);
		expect((await db.query('select id from auth.identities')).rows).toHaveLength(0);
	});

	it('diagnoses the default account without exposing credentials or changing access', async () => {
		await db.exec(migration);
		const query = readFileSync('supabase/diagnostics/admin_login.sql', 'utf8');
		await db.exec('begin read only;');
		const { rows } = await db.query(query);
		await db.exec('rollback;');
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			email: 'admin@owltside.com', email_confirmed: true,
			password_configured: true, email_identity_present: true,
			admin_access_present: true, admin_access_active: true, role: 'Super Admin', tier: 0
		});
		expect(rows[0]).not.toHaveProperty('encrypted_password');
		await db.exec('update public.admin_accounts set is_active = false');
		expect((await db.query(query)).rows[0]).toMatchObject({ admin_access_present: true, admin_access_active: false });
		await db.exec('delete from public.admin_accounts');
		expect((await db.query(query)).rows[0]).toMatchObject({ admin_access_present: false, admin_access_active: null });
	});

	it('uses Auth foreign keys and safe auditor defaults', async () => {
		await db.query('insert into public.admin_accounts (user_id, name) values ($1, $2)', [userId, 'Audit Admin']);
		expect((await db.query('select role, tier, is_active from public.admin_accounts')).rows[0]).toEqual({ role: 'Read-only Auditor', tier: 3, is_active: true });
		await expect(db.query('insert into public.admin_accounts (user_id, name) values ($1, $2)', [randomUUID(), 'Unknown user'])).rejects.toThrow(/foreign key/);
		await expect(db.query('insert into public.admin_accounts (user_id, name) values ($1, $2)', [userId, 'Duplicate'])).rejects.toThrow(/duplicate key/);
	});

	it.each([
		['Super Admin', 0], ['Trust & Safety Lead', 1], ['Finance & Treasury', 1],
		['Event Operations', 2], ['Support Agent', 2], ['Read-only Auditor', 3]
	])('computes tier for %s and prevents arbitrary tier overrides', async (role, tier) => {
		await db.query('insert into public.admin_accounts (user_id, name, role) values ($1, $2, $3)', [userId, 'Admin', role]);
		expect((await db.query('select tier from public.admin_accounts')).rows[0]).toEqual({ tier });
		await expect(db.exec('update public.admin_accounts set tier = 0')).rejects.toThrow(/can only be updated to DEFAULT/);
		await expect(db.exec("update public.admin_accounts set role = 'invented'")).rejects.toThrow(/check constraint/);
	});

	it('prevents public app users from reading, self-enrolling, or changing access', async () => {
		await db.query("insert into public.admin_accounts (user_id, name, role) values ($1, 'Admin', 'Super Admin')", [userId]);
		for (const role of ['anon', 'authenticated']) {
			await db.exec(`set role ${role};`);
			await expect(db.exec('select * from public.admin_accounts')).rejects.toThrow(/permission denied/);
			await expect(db.query("insert into public.admin_accounts (user_id, name, role) values ($1, 'Attacker', 'Super Admin')", [userId])).rejects.toThrow(/permission denied/);
			await expect(db.exec("update public.admin_accounts set role = 'Super Admin'")).rejects.toThrow(/permission denied/);
			await expect(db.exec('delete from public.admin_accounts')).rejects.toThrow(/permission denied/);
		}
	});

	it('allows trusted service-role management, and cascades deleted Auth users', async () => {
		await db.exec('set role service_role;');
		await db.query("insert into public.admin_accounts (user_id, name, role) values ($1, 'Admin', 'Super Admin')", [userId]);
		await db.exec("update public.admin_accounts set is_active = false, role = 'Read-only Auditor'");
		expect((await db.query('select is_active, tier from public.admin_accounts')).rows[0]).toEqual({ is_active: false, tier: 3 });
		await db.exec('reset role;');
		const temporaryId = randomUUID();
		await db.query('insert into auth.users (id) values ($1)', [temporaryId]);
		await db.query("insert into public.admin_accounts (user_id, name) values ($1, 'Temporary')", [temporaryId]);
		await db.query('delete from auth.users where id = $1', [temporaryId]);
		expect((await db.query('select * from public.admin_accounts where user_id = $1', [temporaryId])).rows).toHaveLength(0);
	});
});

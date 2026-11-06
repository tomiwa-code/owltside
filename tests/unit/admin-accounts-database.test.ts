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
		create table auth.users (id uuid primary key);
		grant usage on schema public to anon, authenticated, service_role;
	`);
	await db.exec(migration);
	await db.query('insert into auth.users values ($1)', [userId]);
}, 30_000);

beforeEach(async () => {
	await db.exec('reset role; truncate public.admin_accounts;');
});

afterAll(async () => { await db.close(); });

describe('database-enforced admin access list', () => {
	it('is rerunnable and included unchanged in all-in-one installs', async () => {
		await db.exec(migration);
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration);
		const { rows } = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'public.admin_accounts'::regclass");
		expect(rows[0].relrowsecurity).toBe(true);
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
		await db.query('insert into auth.users values ($1)', [temporaryId]);
		await db.query("insert into public.admin_accounts (user_id, name) values ($1, 'Temporary')", [temporaryId]);
		await db.query('delete from auth.users where id = $1', [temporaryId]);
		expect((await db.query('select * from public.admin_accounts where user_id = $1', [temporaryId])).rows).toHaveLength(0);
	});
});

// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFeeConfigurationPayload } from '$lib/server/fees';

/**
 * Contract test for migration 037 (`public.fee_quote_config()`).
 *
 * The public quote endpoint reads fee configuration through this function when
 * the deployment has no service-role key, so the JSON it returns must map onto
 * the TypeScript `FeeConfiguration` exactly — and it must not become a second
 * way for the browser roles to read or write the fee tables.
 */

const migration = readFileSync('supabase/sql/037_fee_quote_config.sql', 'utf8');
const db = new PGlite();
const seed = readFileSync('supabase/sql/000_full_schema.sql', 'utf8').replace(
	/create extension if not exists pgcrypto;/g,
	''
);

async function asRole(role: 'postgres' | 'anon' | 'authenticated' | 'service_role') {
	await db.exec(`set role ${role};`);
	await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
}

beforeAll(async () => {
	await db.exec(`
		create role anon;
		create role authenticated;
		create role service_role bypassrls;
		create schema auth;
		create table auth.users (
			id uuid primary key,
			instance_id uuid,
			aud text,
			role text,
			email text,
			encrypted_password text,
			email_confirmed_at timestamptz,
			raw_app_meta_data jsonb default '{}'::jsonb,
			raw_user_meta_data jsonb default '{}'::jsonb,
			created_at timestamptz default now(),
			updated_at timestamptz default now()
		);
		create function auth.uid() returns uuid language sql stable as $$
			select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
		$$;
		create function auth.role() returns text language sql stable as $$
			select current_setting('request.jwt.claim.role', true)
		$$;
		create function crypt(text, text) returns text language sql immutable as $$ select 'x' $$;
		create function gen_salt(text) returns text language sql immutable as $$ select 'y' $$;
		create publication supabase_realtime;
		alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
		alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
		alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
	`);
	await db.exec(seed);
	await asRole('postgres');
}, 60_000);

describe('fee_quote_config()', () => {
	it('ships verbatim inside the consolidated schema', () => {
		expect(readFileSync('supabase/sql/000_full_schema.sql', 'utf8')).toContain(migration.trim());
	});

	it('returns the seeded rules and processing policy to an anonymous client', async () => {
		await asRole('anon');
		const { rows } = await db.query<{ config: unknown }>('select public.fee_quote_config() as config');
		const config = parseFeeConfigurationPayload(rows[0].config);
		expect(config.rules.map((rule) => rule.name)).toEqual([
			'low_price_default',
			'mid_range_default',
			'high_price_default'
		]);
		expect(config.policy).toMatchObject({
			processingBps: 150,
			processingFixedKobo: 10_000,
			processingCapKobo: 200_000,
			freeTicketProcessingFeeKobo: 0,
			processingFeeBearer: 'PASS',
			currency: 'NGN'
		});
	});

	it('reflects edits made through the admin console', async () => {
		await asRole('postgres');
		await db.query("update public.fee_rules set percentage_bps = 750 where name = 'high_price_default'");
		await db.query('update public.platform_settings set processing_fee_bearer = $1 where id = 1', ['ABSORB']);
		await asRole('anon');
		const { rows } = await db.query<{ config: unknown }>('select public.fee_quote_config() as config');
		const config = parseFeeConfigurationPayload(rows[0].config);
		expect(config.rules.find((rule) => rule.name === 'high_price_default')?.percentageBps).toBe(750);
		expect(config.policy.processingFeeBearer).toBe('ABSORB');
		await asRole('postgres');
		await db.query("update public.fee_rules set percentage_bps = 500 where name = 'high_price_default'");
		await db.query("update public.platform_settings set processing_fee_bearer = 'PASS' where id = 1");
	});

	it('leaves the fee tables themselves closed to browser roles', async () => {
		await asRole('anon');
		await expect(db.query('select * from public.fee_rules')).rejects.toThrow(/permission denied/i);
		await expect(db.query("update public.fee_rules set percentage_bps = 0")).rejects.toThrow(/permission denied/i);
		await expect(db.query('select * from public.fee_quote_audit')).rejects.toThrow(/permission denied/i);
	});
});

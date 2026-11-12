// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseSource } from '$lib/server/datasource';

/**
 * The event page looks up the viewer's first-contact request only when there is
 * a session. That query used to select `event_slug` / `event_title` from
 * `message_requests` — columns the table has never had — so PostgREST rejected
 * it and every signed-in visitor got a 500 on an event they could open fine as
 * a guest (demo mode never reaches this code).
 *
 * These cases run the datasource against the real schema. A fake PostgREST
 * client resolves each select list against information_schema, so a column or
 * relationship hint that does not exist fails the same way production does.
 */

const db = new PGlite();
const seed = readFileSync('supabase/sql/000_full_schema.sql', 'utf8').replace(
	/create extension if not exists pgcrypto;/g,
	''
);

const REQUESTER = '11111111-1111-4111-8111-111111111111';
const ORGANIZER = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';

const columnCache = new Map<string, Set<string>>();
const fkCache = new Map<string, Set<string>>();

async function columnsOf(table: string): Promise<Set<string>> {
	const hit = columnCache.get(table);
	if (hit) return hit;
	const { rows } = await db.query<{ column_name: string }>(
		"select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
		[table]
	);
	const set = new Set(rows.map((row) => row.column_name));
	columnCache.set(table, set);
	return set;
}

async function relationshipsOf(table: string): Promise<Set<string>> {
	const hit = fkCache.get(table);
	if (hit) return hit;
	const { rows } = await db.query<{ constraint_name: string }>(
		"select constraint_name from information_schema.table_constraints where table_schema = 'public' and table_name = $1",
		[table]
	);
	const set = new Set(rows.map((row) => row.constraint_name));
	fkCache.set(table, set);
	return set;
}

/** Split a PostgREST select list on the commas that are not inside an embed. */
function splitSelect(select: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of select) {
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

/** `alias:table!foreign_key(a,b)` — the form every embed in the datasource uses. */
const EMBED = /^(?:[A-Za-z_][\w]*:)?([a-z_][\w]*)!([\w_]+)\((.*)\)$/;

async function selectProblem(table: string, select: string): Promise<string | null> {
	for (const part of splitSelect(select)) {
		const embed = part.match(EMBED);
		if (embed) {
			const [, target, constraint, inner] = embed;
			if (!(await relationshipsOf(table)).has(constraint)) {
				return `${table}: unknown relationship ${constraint}`;
			}
			const nested = await selectProblem(target, inner);
			if (nested) return nested;
			continue;
		}
		const column = part.replace(/^[A-Za-z_][\w]*:/, '');
		if (!(await columnsOf(table)).has(column)) {
			return `${table}: column ${column} does not exist`;
		}
	}
	return null;
}

/**
 * Minimal stand-in for the supabase-js query builder: it accepts the calls the
 * datasource makes and resolves every select list against the schema.
 */
function schemaCheckingClient() {
	const query = (table: string) => {
		let select = '';
		const builder = {
			select(next: string) {
				select = next;
				return builder;
			},
			eq() {
				return builder;
			},
			order() {
				return builder;
			},
			limit() {
				return builder;
			},
			maybeSingle() {
				return run();
			},
			then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
				return run().then(resolve, reject);
			}
		};
		const run = async () => {
			const problem = await selectProblem(table, select);
			return problem
				? { data: null, error: { message: problem, code: '42703' } }
				: { data: null, error: null };
		};
		return builder;
	};
	return { from: query } as never;
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
	`);
	await db.exec(seed);
}, 60_000);

afterAll(async () => {
	await db.close();
});

describe('message request queries', () => {
	it('detects the column that caused the signed-in 500', async () => {
		// The harness must fail on the original select, or the case below proves nothing.
		await expect(selectProblem('message_requests', 'id,event_slug,event_title')).resolves.toContain(
			'event_slug'
		);
		await expect(
			selectProblem('message_requests', 'requester:profiles!message_requests_nope_fkey(id)')
		).resolves.toContain('unknown relationship');
	});

	it('reads a first-contact request without asking for non-existent columns', async () => {
		const source = supabaseSource(schemaCheckingClient());
		await expect(source.getEventMessageRequest(REQUESTER, EVENT)).resolves.toBeUndefined();
	});

	it('lists incoming requests without asking for non-existent columns', async () => {
		const source = supabaseSource(schemaCheckingClient());
		await expect(source.getIncomingMessageRequests(ORGANIZER)).resolves.toEqual([]);
	});
});

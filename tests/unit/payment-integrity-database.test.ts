// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * End-to-end database checks for the payment-integrity migration (033).
 *
 * These run the same consolidated schema the app is deployed with, so they
 * assert the *contracts* money depends on:
 *   - the free-minting RPC is gone;
 *   - prices and amounts are computed in Postgres, never supplied;
 *   - a payment reference can only be consumed once, at the right amount;
 *   - tickets, notifications and profile flags cannot be rewritten by clients.
 */

const db = new PGlite();
const seed = readFileSync('supabase/sql/000_full_schema.sql', 'utf8').replace(
	/create extension if not exists pgcrypto;/g,
	''
);

const organizer = randomUUID();
const buyer = randomUUID();
const other = randomUUID();
const slug = 'integrity-summit';
const eventId = randomUUID();

type Json = Record<string, unknown>;

async function asRole(role: 'postgres' | 'service_role' | 'authenticated' | 'anon', uid = '') {
	await db.exec(`set role ${role};`);
	await db.query(
		"select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)",
		[role, uid]
	);
}

async function pendingOrder(
	uid: string,
	items: Array<{ tierId: string; qty: number }>,
	promo: string | null = null,
	key: string | null = null
): Promise<Json> {
	await asRole('authenticated', uid);
	const { rows } = await db.query<{ result: Json }>(
		'select public.create_pending_order($1, $2::jsonb, $3, $4) as result',
		[slug, JSON.stringify(items), promo, key]
	);
	return rows[0].result;
}

async function confirmPaid(uid: string, reference: string, amountKobo: number, currency = 'NGN') {
	await asRole('authenticated', uid);
	const { rows } = await db.query<{ result: Json }>(
		'select public.confirm_paid_order($1, $2, $3) as result',
		[reference, amountKobo, currency]
	);
	return rows[0].result;
}

async function confirmWebhook(reference: string, amountKobo: number, currency = 'NGN') {
	await asRole('service_role');
	const { rows } = await db.query<{ result: Json }>(
		'select public.confirm_payment($1, $2, $3, $4::jsonb) as result',
		[reference, amountKobo, currency, '{}']
	);
	return rows[0].result;
}

async function tierSold(): Promise<number> {
	const { rows } = await db.query<{ sold: number }>(
		"select (t ->> 'sold')::int as sold from public.events e, jsonb_array_elements(e.tiers) t where e.id = $1 and t ->> 'id' = 'ga'",
		[eventId]
	);
	return rows[0].sold;
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
		-- Supabase grants anon/authenticated/service_role access to every object
		-- created in public through default privileges. Mirror that so the
		-- migration's own REVOKEs are the thing under test.
		alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
		alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
		alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
	`);
	await db.exec(seed);
	await asRole('postgres');
}, 60_000);

beforeEach(async () => {
	await asRole('postgres');
	await db.exec(`
		truncate public.tickets, public.checkins, public.payments, public.order_items,
		         public.orders, public.notifications, public.scan_attempts, public.checkins;
		delete from public.events where id = '${eventId}';
		delete from public.profiles where id in ('${organizer}', '${buyer}', '${other}');
		delete from auth.users where id in ('${organizer}', '${buyer}', '${other}');
	`);
	await db.query('insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6)', [
		organizer,
		'organizer@example.com',
		buyer,
		'buyer@example.com',
		other,
		'other@example.com'
	]);
	// The auth.users trigger already created these profile rows; give them
	// deterministic handles for the transfer assertions.
	await db.query("update public.profiles set handle = 'hostess', name = 'Host' where id = $1", [organizer]);
	await db.query("update public.profiles set handle = 'buyer_one', name = 'Buyer One' where id = $1", [buyer]);
	await db.query("update public.profiles set handle = 'other_one', name = 'Other One' where id = $1", [other]);
	const cover = JSON.stringify({
		gradient: 'aurora',
		label: 'IS',
		src: `data:image/jpeg;base64,${'A'.repeat(160)}`
	});
	await db.query(
		`insert into public.events (id, slug, title, category, starts_at, venue, city, cover, organizer_id, tiers, status)
		 values ($1, $2, 'Integrity Summit', 'tech', now() + interval '30 days', 'Landmark', 'Lagos',
		         $4::jsonb, $3,
		         '[{"id":"ga","name":"General","price":5000,"sold":0,"capacity":50,"benefits":[]}]'::jsonb,
		         'published')`,
		[eventId, slug, organizer, cover]
	);
});

afterAll(async () => {
	await db.close();
});

describe('checkout is priced and reserved by the database', () => {
	it('no longer exposes the free-minting create_order RPC', async () => {
		await asRole('authenticated', buyer);
		await expect(
			db.query('select public.create_order($1, $2, $3::jsonb)', [buyer, slug, '[]'])
		).rejects.toThrow();
	});

	it('derives the charge from the tier price instead of the request', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 2 }]);

		// 2 × ₦5,000 = ₦10,000 gross, platform fee = 5% + ₦100/pass = ₦700.
		expect(order.amountKobo).toBe(1_070_000);
		expect(order.total).toBe(10_000);
		expect(order.status).toBe('pending');
		expect(order.reference).toMatch(/^OWT-[A-F0-9]{24}$/);
		expect(await tierSold()).toBe(2);

		const { rows } = await db.query<{ amount_kobo: number; status: string; total: number }>(
			'select amount_kobo, status, total from public.orders where reference = $1',
			[order.reference]
		);
		expect(rows[0]).toMatchObject({ amount_kobo: 1_070_000, status: 'pending' });
		// `total` is the organiser's net, not what the buyer is charged.
		expect(Number(rows[0].total)).toBe(10_000);
	});

	it('reuses the pending order for a repeated idempotency key', async () => {
		const first = await pendingOrder(buyer, [{ tierId: 'ga', qty: 2 }], null, 'form-a');
		const second = await pendingOrder(buyer, [{ tierId: 'ga', qty: 2 }], null, 'form-a');

		expect(second.reference).toBe(first.reference);
		expect(second.reused).toBe(true);
		expect(await tierSold()).toBe(2);
		const { rows } = await db.query<{ count: number }>(
			'select count(*)::int as count from public.orders where owner_id = $1',
			[buyer]
		);
		expect(rows[0].count).toBe(1);
	});

	it('applies a valid promo code server-side', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 2 }], 'OWL10');
		// ₦1,000 off + ₦700 fee.
		expect(order.amountKobo).toBe(970_000);
		expect(order.discount).toBe(1000);
	});

	it('rejects unknown tiers and impossible quantities', async () => {
		await expect(pendingOrder(buyer, [{ tierId: 'vip', qty: 1 }])).rejects.toThrow(/Unknown tier/);
		await expect(pendingOrder(buyer, [{ tierId: 'ga', qty: 0 }])).rejects.toThrow(/between 1 and 6/);
	});

	it('refuses to sell an unpublished event', async () => {
		await db.query("update public.events set status = 'pending' where id = $1", [eventId]);
		await expect(pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }])).rejects.toThrow(/approved/);
	});
});

describe('payment confirmation is amount-bound and single-use', () => {
	it('refuses to mint when the paid amount does not match', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }]);
		// Real order is ₦5,000 + ₦350 = ₦5,350 = 535,000 kobo.
		const result = await confirmWebhook(String(order.reference), 500_000);

		expect(result.ok).toBe(false);
		expect(result.reason).toBe('amount_mismatch');
		const { rows } = await db.query<{ count: number }>(
			'select count(*)::int as count from public.tickets where order_id = $1',
			[order.orderId]
		);
		expect(rows[0].count).toBe(0);
	});

	it('mints once and replays the same tickets', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 2 }]);
		const amount = Number(order.amountKobo);

		const first = await confirmWebhook(String(order.reference), amount);
		expect(first.ok).toBe(true);
		expect(first.duplicate).toBe(false);
		expect((first.tickets as unknown[]).length).toBe(2);

		const replay = await confirmWebhook(String(order.reference), amount);
		expect(replay.ok).toBe(true);
		expect(replay.duplicate).toBe(true);
		expect((replay.tickets as unknown[]).length).toBe(2);

		const { rows } = await db.query<{ count: number }>(
			'select count(*)::int as count from public.tickets where order_id = $1',
			[order.orderId]
		);
		expect(rows[0].count).toBe(2);

		const paid = await db.query<{ status: string }>('select status from public.orders where id = $1', [
			order.orderId
		]);
		expect(paid.rows[0].status).toBe('paid');
	});

	it('the paginated client route can settle its own order but not someone else s', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }]);
		const amount = Number(order.amountKobo);

		await expect(confirmPaid(other, String(order.reference), amount)).rejects.toThrow(/not found/i);

		const mine = await confirmPaid(buyer, String(order.reference), amount);
		expect(mine.ok).toBe(true);

		// A second settlement of the same reference is a duplicate, not a mint.
		const again = await confirmPaid(buyer, String(order.reference), amount);
		expect(again.duplicate).toBe(true);
	});

	it('keeps confirm_payment out of reach of client roles', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }]);
		await asRole('authenticated', buyer);
		await expect(
			db.query('select public.confirm_payment($1, $2, $3, $4::jsonb)', [
				order.reference,
				Number(order.amountKobo),
				'NGN',
				'{}'
			])
		).rejects.toThrow(/permission denied|Only the payment service/i);
	});
});

describe('free passes skip the gateway but still mint once', () => {
	it('claims a zero-value order and blocks a paid one', async () => {
		await asRole('postgres');
		await db.query(
			"update public.events set tiers = '[{\"id\":\"ga\",\"name\":\"General\",\"price\":0,\"sold\":0,\"capacity\":50,\"benefits\":[]}]'::jsonb where id = $1",
			[eventId]
		);

		const free = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }]);
		expect(free.amountKobo).toBe(0);

		await asRole('authenticated', buyer);
		const claim = await db.query<{ result: Json }>('select public.claim_free_order($1) as result', [
			free.reference
		]);
		expect(claim.rows[0].result.ok).toBeUndefined();
		expect((claim.rows[0].result.tickets as unknown[]).length).toBe(1);

		await asRole('postgres');
		await db.query(
			"update public.events set tiers = '[{\"id\":\"ga\",\"name\":\"General\",\"price\":5000,\"sold\":0,\"capacity\":50,\"benefits\":[]}]'::jsonb where id = $1",
			[eventId]
		);
		const paid = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }], null, 'paid-key');
		await asRole('authenticated', buyer);
		await expect(db.query('select public.claim_free_order($1)', [paid.reference])).rejects.toThrow(
			/requires payment/
		);
	});
});

describe('client writes to protected state are blocked', () => {
	it('ticket rows are immutable to the buyer', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }]);
		await confirmWebhook(String(order.reference), Number(order.amountKobo));
		const { rows } = await db.query<{ id: string }>('select id from public.tickets where owner_id = $1', [
			buyer
		]);
		const ticketId = rows[0].id;

		await asRole('authenticated', buyer);
		await expect(
			db.query("update public.tickets set status = 'valid', price = 0 where id = $1", [ticketId])
		).rejects.toThrow(/permission denied/i);

		const { rows: after } = await db.query<{ status: string; price: string }>(
			'select status, price from public.tickets where id = $1',
			[ticketId]
		);
		expect(after[0].status).toBe('valid');
		expect(Number(after[0].price)).toBe(5000);
	});

	it('a user cannot disable their own account or spoof another user s notifications', async () => {
		await asRole('authenticated', buyer);
		await expect(
			db.query('update public.profiles set disabled = true where id = $1', [buyer])
		).rejects.toThrow(/admin can/i);

		await expect(
			db.query(
				"insert into public.notifications (user_id, kind, title, body) values ($1, 'system', 'Spoofed', 'payload')",
				[other]
			)
		).rejects.toThrow(/row-level security|violates/i);

		// The same insert for yourself is allowed.
		await db.query(
			"insert into public.notifications (user_id, kind, title, body) values ($1, 'system', 'Mine', 'ok')",
			[buyer]
		);
	});

	it('transfers match on the exact handle, not a display name', async () => {
		const order = await pendingOrder(buyer, [{ tierId: 'ga', qty: 1 }]);
		await confirmWebhook(String(order.reference), Number(order.amountKobo));
		const { rows } = await db.query<{ id: string }>('select id from public.tickets where owner_id = $1', [
			buyer
		]);
		const ticketId = rows[0].id;

		await asRole('authenticated', buyer);
		await expect(db.query('select public.transfer_ticket($1, $2)', [ticketId, 'Other One'])).rejects.toThrow(
			/handle/i
		);

		const { rows: moved } = await db.query<{ result: Json }>(
			'select public.transfer_ticket($1, $2) as result',
			[ticketId, '@other_one']
		);
		expect(moved[0].result).toBeTruthy();
	});
});

describe('scan throttling', () => {
	it('stops a caller after the limit inside the window', async () => {
		await asRole('service_role');
		for (let i = 0; i < 25; i += 1) {
			const { rows } = await db.query<{ count: number }>(
				'select public.consume_scan_attempt($1, 25) as count',
				[buyer]
			);
			expect(rows[0].count).toBe(i + 1);
		}

		await expect(db.query('select public.consume_scan_attempt($1, 25)', [buyer])).rejects.toThrow(
			/Too many gate PIN attempts/
		);

		// The throttle is service-role-only: it cannot be read or reset by clients.
		await asRole('authenticated', buyer);
		await expect(db.query('select public.consume_scan_attempt($1, 25)', [buyer])).rejects.toThrow(
			/permission denied/i
		);
	});
});

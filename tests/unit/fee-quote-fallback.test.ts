// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFeeConfigurationViaRpc, parseFeeConfigurationPayload } from '$lib/server/fees';
import { resolveFeeConfiguration } from '$lib/server/fee-config';
import { POST } from '../../src/routes/api/v1/fees/quote/+server';

/**
 * A fee quote is display-only; the charged amount is computed by
 * `create_pending_order` in Postgres. These cases pin the rule that a fee
 * breakdown must survive a deployment whose web environment cannot read
 * `fee_rules` directly (no service-role key, unapplied migration, audit write
 * failure) instead of rendering "Service fee: Unavailable".
 */

const clients = vi.hoisted(() => ({
	admin: null as unknown,
	request: null as unknown,
	event: null as unknown
}));

vi.mock('$lib/server/fee-api', () => ({
	optionalAdminDb: () => clients.admin,
	getEventForFee: async () => clients.event
}));

vi.mock('$lib/server/supabase', () => ({
	createSupabase: () => clients.request
}));

const policyRow = {
	processing_bps: 150,
	processing_fixed_kobo: 10_000,
	processing_cap_kobo: 200_000,
	free_ticket_processing_fee_kobo: 0,
	processing_fee_bearer: 'PASS',
	currency: 'NGN'
};

const ruleRow = {
	id: 'rule-high',
	name: 'high_price_default',
	min_price_kobo: 1_500_001,
	max_price_kobo: null,
	percentage_bps: 500,
	fixed_fee_kobo: 10_000,
	cap_kobo: 500_000,
	is_active: true,
	priority: 30
};

const tableClient = (rules: unknown[]) => ({
	from: (table: string) =>
		table === 'fee_rules'
			? { select: () => ({ eq: () => ({ order: async () => ({ data: rules, error: null }) }) }) }
			: { select: () => ({ eq: () => ({ single: async () => ({ data: policyRow, error: null }) }) }) }
});

const rpcClient = (result: { data?: unknown; error?: unknown }) => ({ rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }) });

const quote = (body: Record<string, unknown> = {}) =>
	({
		request: new Request('http://app.test/api/v1/fees/quote', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ticketPriceKobo: 2_000_000, quantity: 1, feeBearer: 'PASS', ...body })
		}),
		cookies: {},
		locals: { demoMode: false, session: null }
	}) as never;

beforeEach(() => {
	clients.admin = null;
	clients.request = null;
	clients.event = null;
});

describe('resolveFeeConfiguration', () => {
	it('prefers the authoritative fee tables', async () => {
		const resolved = await resolveFeeConfiguration({ admin: tableClient([ruleRow]) as never, request: null });
		expect(resolved.source).toBe('database');
		expect(resolved.config.rules[0].name).toBe('high_price_default');
	});

	it('falls back to the public RPC when no service-role client exists', async () => {
		const payload = {
			rules: [{ id: 'r1', name: 'flat', minPriceKobo: 1, maxPriceKobo: null, percentageBps: 900, fixedFeeKobo: 0, capKobo: null, isActive: true, priority: 1 }],
			policy: { processingBps: 0, processingFixedKobo: 0, processingCapKobo: null, freeTicketProcessingFeeKobo: 0, processingFeeBearer: 'ABSORB', currency: 'NGN' }
		};
		const resolved = await resolveFeeConfiguration({ admin: null, request: rpcClient({ data: payload }) as never });
		expect(resolved.source).toBe('rpc');
		expect(resolved.config.rules[0].percentageBps).toBe(900);
		expect(resolved.config.policy.processingFeeBearer).toBe('ABSORB');
	});

	it('uses the seed defaults, with a reason, when nothing can be read', async () => {
		const resolved = await resolveFeeConfiguration({
			admin: null,
			request: rpcClient({ error: { code: 'PGRST202', message: 'Could not find the function public.fee_quote_config' } }) as never
		});
		expect(resolved.source).toBe('defaults');
		expect(resolved.config.rules.map((rule) => rule.name)).toEqual(['low_price_default', 'mid_range_default', 'high_price_default']);
		expect(resolved.reason).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
		expect(resolved.reason).toMatch(/037_fee_quote_config/);
	});
});

describe('fee configuration payloads', () => {
	it('treats a missing fee_quote_config() function as "not deployed yet"', async () => {
		expect(await loadFeeConfigurationViaRpc(rpcClient({ error: { code: 'PGRST202', message: 'Could not find the function' } }) as never)).toBeNull();
	});

	it('rejects malformed payloads instead of quoting nonsense', () => {
		expect(() => parseFeeConfigurationPayload(null)).toThrow();
		expect(() => parseFeeConfigurationPayload({ rules: [] })).toThrow(/processing policy/);
		expect(() =>
			parseFeeConfigurationPayload({
				rules: [],
				policy: { processingBps: 150, processingFixedKobo: 10_000, processingCapKobo: null, freeTicketProcessingFeeKobo: 0, processingFeeBearer: 'BUYER', currency: 'NGN' }
			})
		).toThrow(/processing fee bearer/);
	});
});

describe('POST /api/v1/fees/quote', () => {
	it('still quotes a total without a service-role key or the new RPC', async () => {
		const response = await POST(quote());
		expect(response.status).toBe(200);
		const body = await response.json();
		// ₦20,000 ticket: 5% + ₦100 platform (capped at ₦5,000), 1.5% + ₦100 processing.
		expect(body).toMatchObject({
			currency: 'NGN',
			quantity: 1,
			totals: { ticketPriceKobo: 2_000_000, platformFeeKobo: 110_000, processingFeeKobo: 40_000, buyerTotalKobo: 2_150_000 }
		});
	});

	it('uses the database rules served through the public RPC', async () => {
		clients.request = rpcClient({
			data: {
				rules: [{ id: 'r1', name: 'flat', minPriceKobo: 1, maxPriceKobo: null, percentageBps: 900, fixedFeeKobo: 0, capKobo: null, isActive: true, priority: 1 }],
				policy: { processingBps: 0, processingFixedKobo: 0, processingCapKobo: null, freeTicketProcessingFeeKobo: 0, processingFeeBearer: 'PASS', currency: 'NGN' }
			}
		});
		const body = await (await POST(quote())).json();
		expect(body.unit.appliedRuleName).toBe('flat');
		expect(body.totals.platformFeeKobo).toBe(180_000);
		expect(body.totals.processingFeeKobo).toBe(0);
	});

	it('quotes an event whose row predates the fee_bearer column', async () => {
		const eventId = '11111111-2222-4333-8444-555555555555';
		clients.event = { organizer_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', fee_bearer: null };
		const response = await POST(quote({ eventId }));
		expect(response.status).toBe(200);
		expect((await response.json()).unit.feeBearer).toBe('PASS');
	});

	it('never fails a quote because the audit row could not be written', async () => {
		clients.admin = {
			from: (table: string) =>
				table === 'fee_rules'
					? { select: () => ({ eq: () => ({ order: async () => ({ data: [ruleRow], error: null }) }) }) }
					: table === 'platform_settings'
						? { select: () => ({ eq: () => ({ single: async () => ({ data: policyRow, error: null }) }) }) }
						: { insert: async () => ({ error: { code: '42501', message: 'permission denied for table fee_quote_audit' } }) }
		};
		const response = await POST(quote());
		expect(response.status).toBe(200);
		expect((await response.json()).totals.buyerTotalKobo).toBe(2_150_000);
	});

	it('keeps the 503 when a readable configuration leaves the price uncovered', async () => {
		clients.admin = tableClient([
			{ ...ruleRow, min_price_kobo: 1, max_price_kobo: 100, name: 'tiny', priority: 1 }
		]);
		const response = await POST(quote());
		expect(response.status).toBe(503);
		expect((await response.json()).error).toMatch(/temporarily unavailable/);
	});
});

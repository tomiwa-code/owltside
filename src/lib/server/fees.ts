import type { SupabaseClient } from '@supabase/supabase-js';

export type FeeBearer = 'ABSORB' | 'PASS';
export interface FeeRule {
	id: string;
	name: string;
	minPriceKobo: number;
	maxPriceKobo: number | null;
	percentageBps: number;
	fixedFeeKobo: number;
	capKobo: number | null;
	isActive: boolean;
	priority: number;
}
export interface FeePolicy {
	processingBps: number;
	processingFixedKobo: number;
	processingCapKobo: number | null;
	freeTicketProcessingFeeKobo: number;
	processingFeeBearer: FeeBearer;
	currency: string;
}
export interface FeeQuote {
	ticketPriceKobo: number;
	platformFeeKobo: number;
	processingFeeKobo: number;
	buyerTotalKobo: number;
	organizerNetKobo: number;
	feeBearer: FeeBearer;
	processingFeeBearer: FeeBearer;
	appliedRuleId: string | null;
	appliedRuleName: string | null;
	currency: string;
}

// These are seed values only. Runtime quotes load the editable database rows.
export const DEFAULT_FEE_RULES: FeeRule[] = [
	{ id: 'seed-low', name: 'low_price_default', minPriceKobo: 1, maxPriceKobo: 199_999, percentageBps: 400, fixedFeeKobo: 10_000, capKobo: null, isActive: true, priority: 10 },
	{ id: 'seed-mid', name: 'mid_range_default', minPriceKobo: 200_000, maxPriceKobo: 1_500_000, percentageBps: 600, fixedFeeKobo: 10_000, capKobo: null, isActive: true, priority: 20 },
	{ id: 'seed-high', name: 'high_price_default', minPriceKobo: 1_500_001, maxPriceKobo: null, percentageBps: 500, fixedFeeKobo: 10_000, capKobo: 500_000, isActive: true, priority: 30 }
];
export const DEFAULT_FEE_POLICY: FeePolicy = {
	processingBps: 150, processingFixedKobo: 10_000, processingCapKobo: 200_000,
	freeTicketProcessingFeeKobo: 0, processingFeeBearer: 'PASS', currency: 'NGN'
};

const integer = (value: unknown, name: string, min = 0): number => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error(`${name} must be a non-negative integer`);
	return value;
};
const safeAmount = (value: number, name: string) => {
	if (!Number.isSafeInteger(value)) throw new Error(`${name} exceeds the supported integer-kobo range`);
	return value;
};
const roundBps = (amountKobo: number, bps: number) => safeAmount(Number((BigInt(amountKobo) * BigInt(bps) + 5_000n) / 10_000n), 'percentage fee');

export function calculateFeeQuote(input: {
	ticketPriceKobo: number; feeBearer: FeeBearer; rules: FeeRule[]; policy: FeePolicy;
}): FeeQuote {
	const price = integer(input.ticketPriceKobo, 'ticketPriceKobo');
	if (!['ABSORB', 'PASS'].includes(input.feeBearer)) throw new Error('feeBearer must be ABSORB or PASS');
	const ordered = [...input.rules].filter((rule) => rule.isActive).sort((a, b) => a.priority - b.priority);
	const rule = price === 0 ? null : ordered.find((r) => price >= r.minPriceKobo && (r.maxPriceKobo === null || price <= r.maxPriceKobo));
	if (price > 0 && !rule) throw new Error('No active fee rule covers this ticket price');
	const rawPlatform = rule ? safeAmount(roundBps(price, rule.percentageBps) + integer(rule.fixedFeeKobo, 'fixedFeeKobo'), 'platform fee') : 0;
	const platform = rule?.capKobo === null || !rule ? rawPlatform : Math.min(rawPlatform, integer(rule.capKobo, 'capKobo'));
	const proc = input.policy;
	const processing = price === 0
		? Math.min(integer(proc.freeTicketProcessingFeeKobo, 'freeTicketProcessingFeeKobo'), proc.processingCapKobo === null ? Number.MAX_SAFE_INTEGER : integer(proc.processingCapKobo, 'processingCapKobo'))
		: Math.min(safeAmount(roundBps(price, integer(proc.processingBps, 'processingBps')) + integer(proc.processingFixedKobo, 'processingFixedKobo'), 'processing fee'), proc.processingCapKobo === null ? Number.MAX_SAFE_INTEGER : integer(proc.processingCapKobo, 'processingCapKobo'));
	const processingAbsorbed = proc.processingFeeBearer === 'ABSORB';
	const buyerTotal = safeAmount(price + (processingAbsorbed ? 0 : processing) + (input.feeBearer === 'PASS' ? platform : 0), 'buyer total');
	const organizerNet = safeAmount(price - (input.feeBearer === 'ABSORB' ? platform : 0) - (processingAbsorbed ? processing : 0), 'organizer net');
	return {
		ticketPriceKobo: price, platformFeeKobo: platform, processingFeeKobo: processing,
		buyerTotalKobo: buyerTotal, organizerNetKobo: organizerNet, feeBearer: input.feeBearer,
		processingFeeBearer: proc.processingFeeBearer,
		appliedRuleId: rule?.id ?? null, appliedRuleName: rule?.name ?? null, currency: proc.currency
	};
}

export interface FeeConfiguration {
	rules: FeeRule[];
	policy: FeePolicy;
}

/** The documented seed configuration, used only when the database cannot be read. */
export function defaultFeeConfiguration(): FeeConfiguration {
	return { rules: DEFAULT_FEE_RULES.map((rule) => ({ ...rule })), policy: { ...DEFAULT_FEE_POLICY } };
}

function mapRule(row: Record<string, unknown>): FeeRule {
	return {
		id: String(row.id), name: String(row.name), minPriceKobo: Number(row.min_price_kobo),
		maxPriceKobo: row.max_price_kobo === null ? null : Number(row.max_price_kobo),
		percentageBps: Number(row.percentage_bps), fixedFeeKobo: Number(row.fixed_fee_kobo),
		capKobo: row.cap_kobo === null ? null : Number(row.cap_kobo), isActive: row.is_active === true, priority: Number(row.priority)
	};
}

function mapPolicy(p: Record<string, unknown>): FeePolicy {
	const bearer = p.processing_fee_bearer;
	if (bearer !== undefined && bearer !== null && bearer !== 'ABSORB' && bearer !== 'PASS') {
		throw new Error(`Fee policy has an invalid processing fee bearer (${String(bearer)})`);
	}
	return {
		processingBps: integer(Number(p.processing_bps), 'processingBps'),
		processingFixedKobo: integer(Number(p.processing_fixed_kobo), 'processingFixedKobo'),
		processingCapKobo: p.processing_cap_kobo === null ? null : integer(Number(p.processing_cap_kobo), 'processingCapKobo'),
		freeTicketProcessingFeeKobo: integer(Number(p.free_ticket_processing_fee_kobo), 'freeTicketProcessingFeeKobo'),
		processingFeeBearer: (bearer as FeeBearer | null | undefined) ?? 'PASS',
		currency: String(p.currency ?? 'NGN')
	};
}

export async function loadFeeConfiguration(db: SupabaseClient): Promise<FeeConfiguration> {
	const [rulesResult, policyResult] = await Promise.all([
		db.from('fee_rules').select('*').eq('is_active', true).order('priority', { ascending: true }),
		db.from('platform_settings').select('*').eq('id', 1).single()
	]);
	if (rulesResult.error) throw new Error(`Fee rules unavailable (${rulesResult.error.code}): ${rulesResult.error.message}`);
	if (policyResult.error) throw new Error(`Fee policy unavailable (${policyResult.error.code}): ${policyResult.error.message}`);
	return {
		rules: (rulesResult.data ?? []).map((row) => mapRule(row as Record<string, unknown>)),
		policy: mapPolicy(policyResult.data as Record<string, unknown>)
	};
}

/**
 * Read the same configuration through `public.fee_quote_config()` (migration
 * 037). That function is executable by every client role, so a deployment
 * whose web environment has no service-role key can still quote real prices
 * instead of falling back to the seed defaults.
 *
 * Returns `null` when the function has not been deployed yet.
 */
export async function loadFeeConfigurationViaRpc(db: SupabaseClient): Promise<FeeConfiguration | null> {
	const { data, error } = await db.rpc('fee_quote_config');
	if (error) {
		// PGRST202 = PostgREST could not find the function: migration 037 is missing.
		if (error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message ?? '')) return null;
		throw new Error(`Fee configuration unavailable (${error.code}): ${error.message}`);
	}
	if (!data) return null;
	return parseFeeConfigurationPayload(data);
}

/** Map the camelCase JSON returned by `public.fee_quote_config()` to `FeeConfiguration`. */
export function parseFeeConfigurationPayload(payload: unknown): FeeConfiguration {
	const body = payload as { rules?: unknown; policy?: unknown } | null;
	if (!body || typeof body !== 'object') throw new Error('Fee configuration payload is empty');
	const policy = body.policy;
	if (!policy || typeof policy !== 'object') throw new Error('Fee configuration payload has no processing policy');
	if (!Array.isArray(body.rules)) throw new Error('Fee configuration payload has no rule list');
	const rules = body.rules.map((entry, index) => {
		const rule = entry as Record<string, unknown>;
		const name = typeof rule.name === 'string' && rule.name.trim() ? rule.name : `fee rule ${index + 1}`;
		return {
			id: String(rule.id ?? name),
			name,
			minPriceKobo: integer(rule.minPriceKobo, `${name}.minPriceKobo`),
			maxPriceKobo: rule.maxPriceKobo === null || rule.maxPriceKobo === undefined ? null : integer(rule.maxPriceKobo, `${name}.maxPriceKobo`),
			percentageBps: integer(rule.percentageBps, `${name}.percentageBps`),
			fixedFeeKobo: integer(rule.fixedFeeKobo, `${name}.fixedFeeKobo`),
			capKobo: rule.capKobo === null || rule.capKobo === undefined ? null : integer(rule.capKobo, `${name}.capKobo`),
			isActive: rule.isActive !== false,
			// Priority is an ordering hint, not an amount: any integer is valid.
			priority: typeof rule.priority === 'number' && Number.isSafeInteger(rule.priority) ? rule.priority : 0
		} satisfies FeeRule;
	});
	const p = policy as Record<string, unknown>;
	const bearer = p.processingFeeBearer;
	if (bearer !== 'ABSORB' && bearer !== 'PASS') throw new Error('Fee configuration has an invalid processing fee bearer');
	return {
		rules,
		policy: {
			processingBps: integer(p.processingBps, 'processingBps'),
			processingFixedKobo: integer(p.processingFixedKobo, 'processingFixedKobo'),
			processingCapKobo: p.processingCapKobo === null || p.processingCapKobo === undefined ? null : integer(p.processingCapKobo, 'processingCapKobo'),
			freeTicketProcessingFeeKobo: integer(p.freeTicketProcessingFeeKobo, 'freeTicketProcessingFeeKobo'),
			processingFeeBearer: bearer,
			currency: String(p.currency ?? 'NGN')
		}
	};
}

export async function logFeeQuote(db: SupabaseClient, input: {
	quote: FeeQuote; quantity: number; organizerId?: string | null; eventId?: string | null; idempotencyKey?: string | null;
}) {
	const { error } = await db.from('fee_quote_audit').insert({
		event_id: input.eventId ?? null, organizer_id: input.organizerId ?? null,
		idempotency_key: input.idempotencyKey ?? null, quantity: input.quantity,
		quote: input.quote
	});
	if (error && !(error.code === '23505' && input.idempotencyKey)) throw new Error(`Could not record fee quote (${error.code}): ${error.message}`);
}

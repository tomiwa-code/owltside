import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import { createAdminClient } from '$admin/server/supabase-data';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireSuper(locals.admin);
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Invalid fee settings.');
	const rules = (body as { rules?: unknown }).rules;
	const policy = (body as { policy?: unknown }).policy as Record<string, unknown> | undefined;
	if (!Array.isArray(rules) || !policy || typeof policy !== 'object') error(400, 'Fee rules and processing settings are required.');
	const db = createAdminClient();
	for (const item of rules) {
		if (!item || typeof item !== 'object') error(400, 'Invalid fee rule.');
		const r = item as Record<string, unknown>;
		if (typeof r.id !== 'string' || typeof r.name !== 'string' || !Number.isSafeInteger(r.minPriceKobo) || !Number.isSafeInteger(r.percentageBps) || !Number.isSafeInteger(r.fixedFeeKobo)) error(400, 'Fee rule amounts must be integer kobo and rates integer basis points.');
		const patch = {
			name: r.name, min_price_kobo: r.minPriceKobo, max_price_kobo: r.maxPriceKobo ?? null,
			percentage_bps: r.percentageBps, fixed_fee_kobo: r.fixedFeeKobo, cap_kobo: r.capKobo ?? null,
			is_active: r.isActive === true, priority: Number(r.priority) || 0, updated_at: new Date().toISOString()
		};
		const { error: updateError } = await db.from('fee_rules').update(patch).eq('id', r.id);
		if (updateError) error(400, updateError.message);
	}
	const allowedPolicy = ['processingBps', 'processingFixedKobo', 'processingCapKobo', 'freeTicketProcessingFeeKobo', 'processingFeeBearer'] as const;
	const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
	const mapping: Record<(typeof allowedPolicy)[number], string> = {
		processingBps: 'processing_bps', processingFixedKobo: 'processing_fixed_kobo', processingCapKobo: 'processing_cap_kobo',
		freeTicketProcessingFeeKobo: 'free_ticket_processing_fee_kobo', processingFeeBearer: 'processing_fee_bearer'
	};
	for (const key of allowedPolicy) {
		const value = policy[key];
		if (value === undefined) continue;
		if (key === 'processingFeeBearer') {
			if (value !== 'ABSORB' && value !== 'PASS') error(400, 'Invalid processing fee bearer.');
		} else if (value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) error(400, 'Processing settings must use non-negative integer kobo/basis points.');
		values[mapping[key]] = value;
	}
	const { error: policyError } = await db.from('platform_settings').update(values).eq('id', 1);
	if (policyError) error(400, policyError.message);
	return json({ ok: true });
};

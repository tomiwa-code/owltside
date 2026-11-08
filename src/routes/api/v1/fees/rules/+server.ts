import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { adminDb, isPlatformAdmin } from '$lib/server/fee-api';

const ruleSchema = z.object({
	id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80),
	minPriceKobo: z.number().int().min(0), maxPriceKobo: z.number().int().min(0).nullable().optional(),
	percentageBps: z.number().int().min(0).max(100_000), fixedFeeKobo: z.number().int().min(0),
	capKobo: z.number().int().min(0).nullable().optional(), isActive: z.boolean().default(true), priority: z.number().int().default(0)
}).refine((r) => r.maxPriceKobo == null || r.maxPriceKobo >= r.minPriceKobo, { message: 'Maximum price must be at least the minimum price' });
const policySchema = z.object({
	processingBps: z.number().int().min(0).max(100_000).optional(),
	processingFixedKobo: z.number().int().min(0).optional(), processingCapKobo: z.number().int().min(0).nullable().optional(),
	freeTicketProcessingFeeKobo: z.number().int().min(0).optional(),
	processingFeeBearer: z.enum(['ABSORB', 'PASS']).optional(), currency: z.literal('NGN').optional()
});

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!(await isPlatformAdmin(cookies, locals.session?.userId))) return json({ error: 'Admin access required' }, { status: 403 });
	const db = adminDb();
	const [rules, settings] = await Promise.all([
		db.from('fee_rules').select('*').order('priority', { ascending: true }),
		db.from('platform_settings').select('*').eq('id', 1).single()
	]);
	if (rules.error || settings.error) return json({ error: rules.error?.message ?? settings.error?.message }, { status: 503 });
	return json({ rules: rules.data, policy: settings.data }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!(await isPlatformAdmin(cookies, locals.session?.userId))) return json({ error: 'Admin access required' }, { status: 403 });
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return json({ error: 'Invalid request body' }, { status: 400 });
	const db = adminDb();
	if ('platformSettings' in body) {
		const parsedPolicy = policySchema.safeParse((body as { platformSettings: unknown }).platformSettings);
		if (!parsedPolicy.success) return json({ error: parsedPolicy.error.issues[0]?.message }, { status: 400 });
		const p = parsedPolicy.data;
		const { error } = await db.from('platform_settings').update({
			...(p.processingBps !== undefined ? { processing_bps: p.processingBps } : {}),
			...(p.processingFixedKobo !== undefined ? { processing_fixed_kobo: p.processingFixedKobo } : {}),
			...(p.processingCapKobo !== undefined ? { processing_cap_kobo: p.processingCapKobo } : {}),
			...(p.freeTicketProcessingFeeKobo !== undefined ? { free_ticket_processing_fee_kobo: p.freeTicketProcessingFeeKobo } : {}),
			...(p.processingFeeBearer !== undefined ? { processing_fee_bearer: p.processingFeeBearer } : {}),
			updated_at: new Date().toISOString()
		}).eq('id', 1);
		if (error) return json({ error: error.message }, { status: 400 });
		return json({ ok: true });
	}
	const parsed = ruleSchema.safeParse(body);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid fee rule' }, { status: 400 });
	const r = parsed.data;
	const values = {
		name: r.name, min_price_kobo: r.minPriceKobo, max_price_kobo: r.maxPriceKobo ?? null,
		percentage_bps: r.percentageBps, fixed_fee_kobo: r.fixedFeeKobo, cap_kobo: r.capKobo ?? null,
		is_active: r.isActive, priority: r.priority, updated_at: new Date().toISOString()
	};
	const result = r.id
		? await db.from('fee_rules').update(values).eq('id', r.id).select('*').single()
		: await db.from('fee_rules').insert(values).select('*').single();
	if (result.error) return json({ error: result.error.message }, { status: 400 });
	return json({ rule: result.data }, { status: 201 });
};

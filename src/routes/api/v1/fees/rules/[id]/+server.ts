import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { adminDb, isPlatformAdmin } from '$lib/server/fee-api';

const patchSchema = z.object({
	name: z.string().trim().min(1).max(80).optional(), minPriceKobo: z.number().int().min(0).optional(),
	maxPriceKobo: z.number().int().min(0).nullable().optional(), percentageBps: z.number().int().min(0).max(100_000).optional(),
	fixedFeeKobo: z.number().int().min(0).optional(), capKobo: z.number().int().min(0).nullable().optional(),
	isActive: z.boolean().optional(), priority: z.number().int().optional()
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const PATCH: RequestHandler = async ({ params, request, locals, cookies }) => {
	if (!(await isPlatformAdmin(cookies, locals.session?.userId))) return json({ error: 'Admin access required' }, { status: 403 });
	const parsed = patchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid fee rule' }, { status: 400 });
	const value = parsed.data;
	const patch = {
		...(value.name !== undefined ? { name: value.name } : {}),
		...(value.minPriceKobo !== undefined ? { min_price_kobo: value.minPriceKobo } : {}),
		...(value.maxPriceKobo !== undefined ? { max_price_kobo: value.maxPriceKobo } : {}),
		...(value.percentageBps !== undefined ? { percentage_bps: value.percentageBps } : {}),
		...(value.fixedFeeKobo !== undefined ? { fixed_fee_kobo: value.fixedFeeKobo } : {}),
		...(value.capKobo !== undefined ? { cap_kobo: value.capKobo } : {}),
		...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
		...(value.priority !== undefined ? { priority: value.priority } : {}), updated_at: new Date().toISOString()
	};
	const { data, error } = await adminDb().from('fee_rules').update(patch).eq('id', params.id).select('*').maybeSingle();
	if (error) return json({ error: error.message }, { status: 400 });
	if (!data) return json({ error: 'Fee rule not found' }, { status: 404 });
	return json({ rule: data });
};

import type { PageServerLoad } from './$types';
import { getSettings } from '$admin/server/store';
import { createAdminClient } from '$admin/server/supabase-data';

export const load: PageServerLoad = async () => {
	const settings = getSettings();
	try {
		const db = createAdminClient();
		const [rules, policy] = await Promise.all([
			db.from('fee_rules').select('*').order('priority', { ascending: true }),
			db.from('platform_settings').select('*').eq('id', 1).single()
		]);
		if (rules.error || policy.error) throw new Error(rules.error?.message ?? policy.error?.message);
		return {
			settings,
			feeRules: (rules.data ?? []).map((r) => ({ id: r.id, name: r.name, minPriceKobo: r.min_price_kobo, maxPriceKobo: r.max_price_kobo, percentageBps: r.percentage_bps, fixedFeeKobo: r.fixed_fee_kobo, capKobo: r.cap_kobo, isActive: r.is_active, priority: r.priority })),
			feePolicy: { processingBps: policy.data.processing_bps, processingFixedKobo: policy.data.processing_fixed_kobo, processingCapKobo: policy.data.processing_cap_kobo, freeTicketProcessingFeeKobo: policy.data.free_ticket_processing_fee_kobo, processingFeeBearer: policy.data.processing_fee_bearer }
		};
	} catch {
		return { settings, feeRules: [], feePolicy: null, feeConfigError: 'Fee tables unavailable. Apply migrations 034 and 035 first.' };
	}
};

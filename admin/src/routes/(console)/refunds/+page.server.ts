import type { PageServerLoad } from './$types';
import { listSupabaseRefunds } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const data = await listSupabaseRefunds();
	const requested = url.searchParams.get('refund');
	const selected =
		data.rows.find((item) => item.id === requested || item.orderRef === requested) ??
		data.rows.find((item) => item.status === 'pending') ??
		data.rows[0] ??
		null;
	return {
		refunds: { ...data.summary, rows: data.rows },
		selected,
		selectedId: selected?.id ?? null,
		eligible: data.rows.filter((item) => item.status === 'pending' && item.policyMatch >= 90).length,
		recent: null,
		source: 'supabase' as const
	};
};

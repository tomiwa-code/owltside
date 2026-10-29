import type { PageServerLoad } from './$types';
import { listSupabaseRefunds } from '$admin/server/supabase-data';

const emptyRefunds = {
	rows: [] as Awaited<ReturnType<typeof listSupabaseRefunds>>['rows'],
	summary: { pending: 0, total30dNgn: 0, successRate: 0, avgResolutionHours: 0, escrowNgn: 0 }
};

export const load: PageServerLoad = async ({ url }) => {
	let data: Awaited<ReturnType<typeof listSupabaseRefunds>> = emptyRefunds;
	let error = '';
	try {
		data = await listSupabaseRefunds();
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'The refund queue could not be loaded.';
	}
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
		error,
		source: error ? ('unavailable' as const) : ('supabase' as const)
	};
};

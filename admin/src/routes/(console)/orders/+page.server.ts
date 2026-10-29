import type { PageServerLoad } from './$types';
import { listSupabaseOrders } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as 'settled' | 'pending' | 'failed' | 'refunded' | 'disputed' | 'all';
	const method = url.searchParams.get('method') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;

	try {
		const result = await listSupabaseOrders({ q, status, method, page, perPage: 9 });
		const selected = result.page.rows[0] ?? null;
		return {
			table: result.page,
			methods: result.methods,
			filters: { q, status, method },
			counts: result.counts,
			financials: result.financials,
			selected,
			selectedId: selected?.id ?? null,
			error: '',
			source: 'supabase' as const
		};
	} catch (cause) {
		const error = cause instanceof Error ? cause.message : 'The order ledger could not be loaded.';
		return {
			table: { rows: [], total: 0, page: 1, pages: 1, perPage: 9 },
			methods: [] as string[],
			filters: { q, status, method },
			counts: { total: 0, settled: 0, pending: 0, failed: 0, refunded: 0, disputed: 0 },
			financials: { grossNgn: 0, settledNgn: 0, pendingNgn: 0, failedNgn: 0, settledPct: 0 },
			selected: null,
			selectedId: null,
			error,
			source: 'unavailable' as const
		};
	}
};

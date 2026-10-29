import type { PageServerLoad } from './$types';
import { listSupabaseOrders } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as 'settled' | 'pending' | 'failed' | 'refunded' | 'disputed' | 'all';
	const method = url.searchParams.get('method') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;

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
		source: 'supabase' as const
	};
};

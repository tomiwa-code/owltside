// @ts-nocheck
import type { PageServerLoad } from './$types';
import { countOrders, getOrder, listOrders } from '$admin/server/store';
import { FINANCIALS } from '$admin/server/seed';

export const load = ({ url }: Parameters<PageServerLoad>[0]) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as 'settled' | 'pending' | 'failed' | 'refunded' | 'disputed' | 'all';
	const method = url.searchParams.get('method') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const table = listOrders({ q, status, method, page, perPage: 9 });
	const requested = url.searchParams.get('order');
	const selected = getOrder(requested ?? '') ?? table.rows[0] ?? null;

	return {
		table: { rows: table.rows, total: table.total, page: table.page, pages: table.pages, perPage: table.perPage },
		methods: table.methods,
		filters: { q, status, method },
		counts: countOrders(),
		financials: {
			grossNgn: FINANCIALS.grossNgn,
			settledNgn: FINANCIALS.settledNgn,
			pendingNgn: FINANCIALS.pendingNgn,
			failedNgn: FINANCIALS.failedNgn,
			settledPct: FINANCIALS.settledPct
		},
		selected: selected ?? null,
		selectedId: selected?.id ?? null
	};
};

import type { PageServerLoad } from './$types';
import type { AdminTicket } from '$admin/types';
import { listSupabaseTickets } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminTicket['status'] | 'all';
	const eventId = url.searchParams.get('eventId') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;

	try {
		const result = await listSupabaseTickets({ q, status, eventId, page, perPage: 8 });
		const selected = result.page.rows[0] ?? null;
		return {
			table: result.page,
			events: result.events,
			filters: { q, status, eventId },
			counts: result.counts,
			selected,
			selectedId: selected?.id ?? null,
			error: '',
			source: 'supabase' as const
		};
	} catch (cause) {
		const error = cause instanceof Error ? cause.message : 'The ticket ledger could not be loaded.';
		return {
			table: { rows: [], total: 0, page: 1, pages: 1, perPage: 8 },
			events: [] as { id: string; title: string }[],
			filters: { q, status, eventId },
			counts: { total: 0, valid: 0, revoked: 0, valueNgn: 0, avgPriceNgn: 0 },
			selected: null,
			selectedId: null,
			error,
			source: 'unavailable' as const
		};
	}
};

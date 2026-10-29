import type { PageServerLoad } from './$types';
import type { AdminTicket } from '$admin/types';
import { listSupabaseTickets } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminTicket['status'] | 'all';
	const eventId = url.searchParams.get('eventId') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;

	const result = await listSupabaseTickets({ q, status, eventId, page, perPage: 8 });
	const selected = result.page.rows[0] ?? null;

	return {
		table: result.page,
		events: result.events,
		filters: { q, status, eventId },
		counts: result.counts,
		selected,
		selectedId: selected?.id ?? null,
		source: 'supabase' as const
	};
};

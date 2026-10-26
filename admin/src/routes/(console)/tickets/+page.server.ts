import type { PageServerLoad } from './$types';
import { countTickets, getTicket, listTickets } from '$admin/server/store';
import type { AdminTicket } from '$admin/types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminTicket['status'] | 'all';
	const eventId = url.searchParams.get('eventId') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const table = listTickets({ q, status, eventId, page, perPage: 8 });
	const requested = url.searchParams.get('ticket');
	const selected =
		getTicket(requested ?? '') ??
		table.rows.find((ticket) => ticket.status === 'valid') ??
		table.rows[0] ??
		null;

	return {
		table: { rows: table.rows, total: table.total, page: table.page, pages: table.pages, perPage: table.perPage },
		events: table.events,
		filters: { q, status, eventId },
		counts: countTickets(),
		selected,
		selectedId: selected?.id ?? null
	};
};

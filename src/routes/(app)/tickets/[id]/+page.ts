import type { ApprovalRequest, Ticket } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * One pass, read from the ticket vault cache.
 *
 * The vault key (`tickets:mine`) is shared with the tickets tab, so opening a
 * pass and going back costs no request while it is fresh. Refunds come from
 * the approvals cache, which is where the request the user just filed lands.
 */
export const load: PageLoad = async ({ fetch, params, parent }) => {
	const { session } = await parent();
	// The vault is private; a guest has no pass to show.
	if (!session) error(404, 'Ticket not found');

	const [tickets, approvals] = await Promise.all([
		cachedJson<Ticket[]>(fetch, {
			key: queryKeys.tickets,
			url: '/api/tickets',
			staleTime: STALE_TIME.tickets
		}).catch(() => [] as Ticket[]),
		cachedJson<ApprovalRequest[]>(fetch, {
			key: queryKeys.approvals,
			url: '/api/approvals',
			staleTime: STALE_TIME.account
		}).catch(() => [] as ApprovalRequest[])
	]);

	const ticket = tickets.find((item) => item.id === params.id);
	if (!ticket) error(404, 'Ticket not found');

	// Refunds need an admin decision, so surface the outstanding request (if any)
	// rather than pretending the pass was already cancelled.
	const refundRequest =
		approvals.find((request) => request.kind === 'refund' && request.subjectId === ticket.id) ?? null;

	return { ticket, refundRequest };
};

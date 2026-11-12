import type { ApprovalRequest, Ticket } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/**
 * The vault is private and changes only through transfers/refunds, so it lives
 * in the query cache. A tab switch inside the freshness window does not touch
 * the server; the cache is invalidated after a mutation.
 */
export const load: PageLoad = async ({ fetch, parent }) => {
	const { session } = await parent();
	// Unregistered visitors are asked to sign in; never fall back to demo data.
	if (!session) return { tickets: [], approvals: [], session: null };

	const [tickets, approvals] = await Promise.all([
		cachedJson<Ticket[]>(fetch, {
			key: queryKeys.tickets,
			url: '/api/tickets',
			staleTime: 15_000
		}).catch(() => [] as Ticket[]),
		cachedJson<ApprovalRequest[]>(fetch, {
			key: queryKeys.approvals,
			url: '/api/approvals',
			staleTime: STALE_TIME.account
		}).catch(() => [] as ApprovalRequest[])
	]);
	return { tickets, approvals, session };
};

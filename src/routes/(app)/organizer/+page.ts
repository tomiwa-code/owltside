import type { ApprovalRequest, OrganizerPayload } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/** Identity values for the ledger, so a failed payload still renders zeroes. */
const EMPTY_PAYLOAD: OrganizerPayload = {
	events: [],
	stats: {
		revenue: 0,
		netRevenue: 0,
		refunds: 0,
		refunded: 0,
		revenueDeltaPct: null,
		checkedIn: 0,
		capacity: 0,
		orders: 0,
		soldPct: 0,
		soldLastHour: 0,
		payout: 0,
		held: 0
	},
	settlements: {},
	checkins: [],
	orders: []
};

/**
 * The organizer console is a tab for organizers: its ledger and approvals come
 * from the cache, so switching back to it does not re-run the settlement read.
 */
export const load: PageLoad = async ({ fetch }) => {
	const [payload, approvals] = await Promise.all([
		cachedJson<OrganizerPayload>(fetch, {
			key: queryKeys.organizer,
			url: '/api/organizer',
			staleTime: STALE_TIME.organizer
		}).catch(() => EMPTY_PAYLOAD),
		cachedJson<ApprovalRequest[]>(fetch, {
			key: queryKeys.approvals,
			url: '/api/approvals',
			staleTime: STALE_TIME.account
		}).catch(() => [] as ApprovalRequest[])
	]);
	return { payload, approvals };
};

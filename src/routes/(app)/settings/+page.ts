import type { ApprovalRequest } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/** Verification/payout decisions, shared with the organizer console's key. */
export const load: PageLoad = async ({ fetch }) => {
	const approvals = await cachedJson<ApprovalRequest[]>(fetch, {
		key: queryKeys.approvals,
		url: '/api/approvals',
		staleTime: STALE_TIME.account
	}).catch(() => [] as ApprovalRequest[]);
	return { approvals };
};

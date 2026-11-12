import type { ApprovalRequest, EventItem, OrganizerPayload } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { isEventClosed } from '$lib/utils/event-status';
import { approvedPayoutAccount } from '$lib/utils/verification';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * The create/edit wizard, cache-first. It reads the organizer ledger (for the
 * event being edited) and the approvals cache (for the saved payout account)
 * from the same keys the console uses, so leaving the wizard and coming back
 * does not repeat either read. `?edit=` is a URL value, so editing another
 * event does re-run this load — that is the intended signal.
 */
export const load: PageLoad = async ({ fetch, parent, url }) => {
	const { session } = await parent();
	const editId = url.searchParams.get('edit');

	const [organizer, approvals] = await Promise.all([
		editId
			? cachedJson<OrganizerPayload>(fetch, {
					key: queryKeys.organizer,
					url: '/api/organizer',
					staleTime: STALE_TIME.organizer
				}).catch(() => undefined)
			: Promise.resolve(undefined),
		cachedJson<ApprovalRequest[]>(fetch, {
			key: queryKeys.approvals,
			url: '/api/approvals',
			staleTime: STALE_TIME.account
		}).catch(() => [] as ApprovalRequest[])
	]);

	let event: EventItem | null = null;
	if (editId) {
		event = organizer?.events.find((item) => item.id === editId) ?? null;
		if (!event) redirect(302, '/organizer');
		if (isEventClosed(event)) redirect(302, '/organizer?tab=past');
	}

	return {
		owner: session?.userId ?? 'demo',
		event,
		payoutAccount: approvedPayoutAccount(approvals)
	};
};

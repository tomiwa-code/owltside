import type {
	ApprovalRequest,
	Checkin,
	EventItem,
	Order,
	OrganizerPayload,
	Ticket
} from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

interface OrganizerEventPayload {
	organizer: OrganizerPayload;
	event: EventItem;
	tickets: Ticket[];
	orders: Order[];
	checkins: Checkin[];
	approvals: ApprovalRequest[];
}

/**
 * The event manager, cache-first. The organizer console poll is slow (45 s) and
 * sales never arrive over Realtime, so a short freshness window keeps the tabs
 * honest while still making a tab switch free. An event that is gone from the
 * organizer's own list sends them back to the console, as before.
 */
export const load: PageLoad = async ({ fetch, params }) => {
	const payload = await cachedJson<OrganizerEventPayload>(fetch, {
		key: queryKeys.organizerEvent(params.id),
		url: `/api/organizer/events/${encodeURIComponent(params.id)}`,
		staleTime: STALE_TIME.organizer
	}).catch(() => undefined);

	if (!payload?.event) redirect(302, '/organizer');
	return payload;
};

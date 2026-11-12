import type { OrganizerPayload } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { isEventClosed } from '$lib/utils/event-status';
import type { PageLoad } from './$types';

/**
 * The gate terminal, cache-first. It only needs the organizer's open events and
 * the `?eventId=` hint, so a warm organizer console makes arming the scanner
 * free; the gate itself then reports check-ins straight to the API.
 */
export const load: PageLoad = async ({ fetch, url }) => {
	const payload = await cachedJson<OrganizerPayload>(fetch, {
		key: queryKeys.organizer,
		url: '/api/organizer',
		staleTime: STALE_TIME.organizer
	}).catch(() => undefined);

	// The scanner always opens into the same PIN → camera → scan flow: with an
	// active gated event it settles scans at that gate, and without one
	// (including before any event exists) it arms in standalone terminal mode.
	const events = (payload?.events ?? []).filter((event) => !isEventClosed(event));
	const requestedEvent = url.searchParams.get('eventId');
	const initialEventId =
		events.find((event) => event.id === requestedEvent)?.id ??
		events.find((event) => (event.gates ?? []).length > 0)?.id ??
		events[0]?.id ??
		'';

	// Only the open events are needed here; the ledger stays in the cached entry.
	return { organizer: { events }, initialEventId };
};

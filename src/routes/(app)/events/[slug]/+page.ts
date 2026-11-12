import type { EventItem, MessageRequest } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Event detail, read from the cache while it is fresh.
 *
 * The public event payload and the visitor's "message the organizer" state are
 * separate keys: the first is shared by everyone, the second is per-user and
 * must never be baked into the shared entry. Only signed-in visitors request
 * the second one — guests skip the round trip entirely.
 */
export const load: PageLoad = async ({ fetch, params, parent }) => {
	const slug = params.slug;
	const { session } = await parent();

	const [event, messageRequest] = await Promise.all([
		cachedJson<EventItem>(fetch, {
			key: queryKeys.event(slug),
			url: `/api/events/${encodeURIComponent(slug)}`,
			staleTime: STALE_TIME.live
		}).catch(() => undefined),
		session
			? cachedJson<{ request: MessageRequest | null }>(fetch, {
					key: queryKeys.eventMessageRequest(slug),
					url: `/api/events/${encodeURIComponent(slug)}/message-request`,
					staleTime: STALE_TIME.live
				})
					.then((payload) => payload.request ?? null)
					.catch(() => null)
			: Promise.resolve(null)
	]);

	if (!event) error(404, 'Event not found');
	return { event, messageRequest };
};

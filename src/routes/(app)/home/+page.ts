import type { EventItem } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/**
 * Universal (not server-only) load: the first render fetches through the API,
 * while later tab switches read the TanStack cache and issue no request.
 */
export const load: PageLoad = async ({ fetch }) => {
	try {
		const events = await cachedJson<EventItem[]>(fetch, {
			key: queryKeys.events,
			url: '/api/events',
			staleTime: STALE_TIME.catalogue
		});
		return { events };
	} catch {
		return { events: [] as EventItem[] };
	}
};

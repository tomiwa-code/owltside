import type { EventItem } from '$lib/types';

/** The public catalogue API refuses bulk exports, so read it in bounded pages. */
const CATALOGUE_PAGE = 60;
const CATALOGUE_MAX = 200;

/**
 * Fetch the whole public catalogue (the explore page needs it for category
 * counts and client-side filtering). Bounded at 200, matching the datasource.
 */
export async function fetchEventCatalogue(fetchFn: typeof fetch = fetch): Promise<EventItem[]> {
	const events: EventItem[] = [];
	for (let offset = 0; offset < CATALOGUE_MAX; offset += CATALOGUE_PAGE) {
		const response = await fetchFn(`/api/events?limit=${CATALOGUE_PAGE}&offset=${offset}`);
		if (!response.ok) throw new Error(`/api/events failed with ${response.status}`);
		const batch = (await response.json()) as EventItem[];
		if (!Array.isArray(batch) || batch.length === 0) break;
		events.push(...batch);
		if (batch.length < CATALOGUE_PAGE) break;
	}
	return events;
}

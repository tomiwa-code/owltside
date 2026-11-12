import type { EventFilters, EventItem, Profile } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { fetchEventCatalogue } from '$lib/query/api';
import { queryKeys } from '$lib/query/keys';
import { cachedJson, cachedRequest } from '$lib/query/load';
import { filterEventList } from '$lib/utils/event-filters';
import type { PageLoad } from './$types';

function readFilters(url: URL): EventFilters {
	return {
		category: (url.searchParams.get('category') as EventFilters['category']) ?? undefined,
		query: url.searchParams.get('q') ?? undefined,
		freeOnly: url.searchParams.get('free') === '1',
		dateFrom: url.searchParams.get('from') ?? undefined,
		dateTo: url.searchParams.get('to') ?? undefined,
		sort: (url.searchParams.get('sort') as EventFilters['sort']) ?? undefined
	};
}

/**
 * Filter changes re-run this load, but the catalogue itself is cached: only a
 * cold/stale cache pays for the bounded catalogue requests.
 */
export const load: PageLoad = async ({ fetch, url }) => {
	const filters = readFilters(url);
	try {
		const allEvents = await cachedRequest<EventItem[]>({
			key: queryKeys.eventsCatalogue,
			staleTime: STALE_TIME.catalogue,
			request: () => fetchEventCatalogue(fetch)
		});
		const events = filterEventList(allEvents, filters);
		const term = filters.query?.trim();
		const users = term
			? await cachedJson<Profile[]>(fetch, {
					key: queryKeys.profileSearch(term),
					url: `/api/profiles/search?q=${encodeURIComponent(term)}`,
					staleTime: STALE_TIME.account
				}).catch(() => [])
			: [];
		return { events, allEvents, users, filters, searchError: '' };
	} catch {
		return {
			events: [] as EventItem[],
			allEvents: [] as EventItem[],
			users: [] as Profile[],
			filters,
			searchError: 'Search is unavailable right now. Please try again.'
		};
	}
};

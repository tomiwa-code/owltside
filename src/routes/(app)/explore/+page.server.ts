import { filterEventList, getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { CategoryId, EventFilters } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies, locals, setHeaders }) => {
	const filters: EventFilters = {
		category: (url.searchParams.get('category') as CategoryId) ?? undefined,
		query: url.searchParams.get('q') ?? undefined,
		freeOnly: url.searchParams.get('free') === '1',
		dateFrom: url.searchParams.get('from') ?? undefined,
		dateTo: url.searchParams.get('to') ?? undefined,
		sort: (url.searchParams.get('sort') as EventFilters['sort']) ?? undefined
	};
	// Anonymous discovery pages are the most-scraped URLs on the site. Let the
	// browser/CDN answer repeats for a minute instead of re-rendering them.
	setHeaders({ 'cache-control': cacheControl(locals.session ? 'private' : 'public') });

	const source = getSource(createSupabase(cookies));
	try {
		// One read, two answers. The old load ran `listEvents(filters)` *and*
		// `listEvents()` — the entire catalogue twice, on every filter change.
		const allEvents = await source.listEvents({ limit: 200 });
		const events = filterEventList(allEvents, filters);
		const users = filters.query?.trim() ? await source.searchProfiles(filters.query.trim()) : [];
		return { events, allEvents, users, filters, searchError: '' };
	} catch {
		return { events: [], allEvents: [], users: [], filters, searchError: 'Search is unavailable right now. Please try again.' };
	}
};

function cacheControl(scope: 'public' | 'private'): string {
	return scope === 'public'
		? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
		: 'private, max-age=0, must-revalidate';
}

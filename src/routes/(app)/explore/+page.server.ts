import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { CategoryId, EventFilters } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const filters: EventFilters = {
		category: (url.searchParams.get('category') as CategoryId) ?? undefined,
		query: url.searchParams.get('q') ?? undefined,
		freeOnly: url.searchParams.get('free') === '1',
		dateFrom: url.searchParams.get('from') ?? undefined,
		dateTo: url.searchParams.get('to') ?? undefined,
		sort: (url.searchParams.get('sort') as EventFilters['sort']) ?? undefined
	};
	const source = getSource(createSupabase(cookies));
	try {
		const [events, allEvents, users] = await Promise.all([source.listEvents(filters), source.listEvents(), filters.query?.trim() ? source.searchProfiles(filters.query.trim()) : Promise.resolve([])]);
		return { events, allEvents, users, filters, searchError: '' };
	} catch {
		return { events: [], allEvents: [], users: [], filters, searchError: 'Search is unavailable right now. Please try again.' };
	}
};

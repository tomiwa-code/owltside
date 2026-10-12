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
	const events = await getSource(createSupabase(cookies)).listEvents(filters);
	return { events, filters };
};

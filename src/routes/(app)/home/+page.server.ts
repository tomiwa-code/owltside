import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { detectHeaderLocation } from '$lib/utils/organizers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, request, locals, setHeaders }) => {
	const source = getSource(createSupabase(cookies));
	const events = await source.listEvents().catch(() => []);
	const detectedLocation = detectHeaderLocation(request?.headers);
	// Anonymous visitors (and crawlers) can be served from the edge; signed-in
	// renders stay private because the shell carries their session.
	setHeaders({
		'cache-control': locals.session
			? 'private, max-age=0, must-revalidate'
			: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
	});
	return { events, ...(detectedLocation ? { detectedLocation } : {}) };
};

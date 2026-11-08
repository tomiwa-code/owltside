import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { detectHeaderLocation } from '$lib/utils/organizers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, request }) => {
	const source = getSource(createSupabase(cookies));
	const events = await source.listEvents().catch(() => []);
	const detectedLocation = detectHeaderLocation(request?.headers);
	return { events, ...(detectedLocation ? { detectedLocation } : {}) };
};

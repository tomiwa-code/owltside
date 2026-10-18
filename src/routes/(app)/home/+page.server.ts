import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const source = getSource(createSupabase(cookies));
	const events = await source.listEvents().catch(() => []);
	return { events };
};

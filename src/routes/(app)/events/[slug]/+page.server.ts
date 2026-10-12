import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const event = await getSource(createSupabase(cookies)).getEvent(params.slug);
	if (!event) error(404, 'Event not found');
	return { event };
};

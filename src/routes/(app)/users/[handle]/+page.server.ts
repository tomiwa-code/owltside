import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const profile = await source.getProfile(params.handle);
	if (!profile) error(404, 'No such person');
	const events = await source.getProfileEvents(profile.id);
	return { profile, events };
};

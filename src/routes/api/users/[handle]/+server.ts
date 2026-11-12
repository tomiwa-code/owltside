import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** A public profile and the events it hosts/speaks at. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const profile = await source.getProfile(params.handle);
	if (!profile) error(404, 'No such person');
	const events = await source.getProfileEvents(profile.id);
	return json(
		{ profile, events },
		{ headers: { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } }
	);
};

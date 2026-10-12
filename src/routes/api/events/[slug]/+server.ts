import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const event = await getSource(createSupabase(cookies)).getEvent(params.slug);
	if (!event) error(404, 'Event not found');
	return json(event, { headers: { 'cache-control': 'public, max-age=15, stale-while-revalidate=60' } });
};

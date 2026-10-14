import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import { OPERATING_IDENTITY_COOKIE } from '$lib/constants/operating-identity';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (cookies.get(OPERATING_IDENTITY_COOKIE) !== 'organizer') error(403, 'Organizer identity required');
	const payload = await getSource(createSupabase(cookies)).getOrganizer(
		locals.session?.userId ?? 'demo'
	);
	return json(payload, { headers: { 'cache-control': 'private, max-age=5, stale-while-revalidate=15' } });
};

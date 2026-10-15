import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const payload = await getSource(createSupabase(cookies)).getOrganizer(
		locals.session?.userId ?? 'demo'
	);
	return json(payload, { headers: { 'cache-control': 'private, max-age=5, stale-while-revalidate=15' } });
};

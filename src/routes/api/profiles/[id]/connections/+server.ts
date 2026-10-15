import { json } from '@sveltejs/kit';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const kind = url.searchParams.get('kind');
	if (kind !== 'followers' && kind !== 'following') return json({ error: 'Invalid list.' }, { status: 400 });
	try {
		return json(await getSource(createSupabase(cookies)).getConnections(params.id, kind), { headers: { 'cache-control': 'private, no-store' } });
	} catch {
		return json({ error: 'Could not load this list. Please try again.' }, { status: 503 });
	}
};

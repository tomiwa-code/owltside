import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.session?.userId) {
		return json({ error: 'Sign in to view this conversation.' }, { status: 401 });
	}
	// RLS restricts the rows to participants; this check keeps guests out entirely.
	const items = await getSource(createSupabase(cookies)).getMessages(params.id);
	return json(items, { headers: { 'cache-control': 'private, no-store' } });
};

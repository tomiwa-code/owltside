import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const items = await getSource(createSupabase(cookies)).getMessages(params.id);
	return json(items, { headers: { 'cache-control': 'private, no-store' } });
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const userId = locals.session?.userId ?? 'demo';
	const items = await getSource(createSupabase(cookies)).getNotifications(userId);
	return json(items, { headers: { 'cache-control': 'private, max-age=10, stale-while-revalidate=30' } });
};

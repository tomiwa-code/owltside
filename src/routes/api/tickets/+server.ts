import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const userId = locals.session?.userId ?? 'demo';
	const tickets = await getSource(createSupabase(cookies)).getTickets(userId);
	return json(tickets, { headers: { 'cache-control': 'private, max-age=10, stale-while-revalidate=30' } });
};

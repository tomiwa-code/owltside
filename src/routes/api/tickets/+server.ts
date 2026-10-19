import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.session?.userId) {
		return json({ error: 'Sign in to view your tickets.' }, { status: 401 });
	}
	const tickets = await getSource(createSupabase(cookies)).getTickets(locals.session.userId);
	return json(tickets, { headers: { 'cache-control': 'private, max-age=10, stale-while-revalidate=30' } });
};

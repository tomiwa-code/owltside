import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const tickets = await getSource(createSupabase(cookies)).getTickets(locals.session?.userId ?? 'demo');
	const ticket = tickets.find((t) => t.id === params.id);
	if (!ticket) error(404, 'Ticket not found');
	return { ticket };
};

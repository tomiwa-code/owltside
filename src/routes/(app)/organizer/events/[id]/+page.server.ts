import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const organizer = await source.getOrganizer(userId);
	const event = organizer.events.find((e) => e.id === params.id);
	if (!event) redirect(302, '/organizer');
	const tickets = await source.getEventTickets(params.id);
	const orders = await source.getEventOrders(params.id);
	const checkins = await source.getEventCheckins(params.id);
	return { organizer, event, tickets, orders, checkins };
};

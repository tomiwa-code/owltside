import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getSupabaseEvent,
	listSupabaseOrders,
	listSupabaseTickets
} from '$admin/server/supabase-data';
import { auditFor } from '$admin/server/store';

export const load: PageServerLoad = async ({ params }) => {
	const event = await getSupabaseEvent(params.id);
	if (!event) error(404, 'Event not found');

	const [ordersRes, ticketsRes] = await Promise.all([
		listSupabaseOrders({ page: 1, perPage: 50 }).catch(() => ({ page: { rows: [] } })),
		listSupabaseTickets({ eventId: event.id, page: 1, perPage: 25 }).catch(() => ({
			page: { rows: [] }
		}))
	]);

	const eventOrders = ordersRes.page.rows.filter((order) => order.eventId === event.id).slice(0, 12);

	return {
		event,
		orders: eventOrders,
		tickets: ticketsRes.page.rows,
		audit: auditFor(event.id, 10),
		source: 'supabase' as const,
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auditFor, getEvent, relatedOrders, relatedTickets } from '$admin/server/store';

export const load: PageServerLoad = ({ params }) => {
	const event = getEvent(params.id);
	if (!event) error(404, 'Event not found');
	return {
		event,
		orders: relatedOrders(event.id, 6),
		tickets: relatedTickets(event.id, 6),
		audit: auditFor(event.id, 5),
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auditFor, getEvent, relatedOrders, relatedTickets } from '$admin/server/store';
import { adminDataSource, getSupabaseEvent, liveFailure } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const source = adminDataSource();
	if (source === 'supabase') {
		let event: Awaited<ReturnType<typeof getSupabaseEvent>>;
		try {
			event = await getSupabaseEvent(params.id);
		} catch (cause) {
			liveFailure('event record', cause);
		}
		if (!event) error(404, 'Event not found');
		return {
			event,
			orders: [],
			tickets: [],
			audit: [],
			source,
			publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
		};
	}
	const event = getEvent(params.id);
	if (!event) error(404, 'Event not found');
	return {
		event,
		orders: relatedOrders(event.id, 6),
		tickets: relatedTickets(event.id, 6),
		audit: auditFor(event.id, 5),
		source,
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

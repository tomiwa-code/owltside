import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auditFor, getEvent, relatedOrders, relatedTickets } from '$admin/server/store';
import { adminDataSource, getSupabaseEvent } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const source = adminDataSource();
	const event = source === 'supabase' ? await getSupabaseEvent(params.id) : getEvent(params.id);
	if (!event) error(404, 'Event not found');
	return {
		event,
		orders: source === 'supabase' ? [] : relatedOrders(event.id, 6),
		tickets: source === 'supabase' ? [] : relatedTickets(event.id, 6),
		audit: source === 'supabase' ? [] : auditFor(event.id, 5),
		source,
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

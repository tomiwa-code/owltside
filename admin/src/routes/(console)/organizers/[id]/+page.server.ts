import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eventsForOrganizer, getOrganizer, relatedOrders, auditFor } from '$admin/server/store';
import { adminDataSource, getSupabaseOrganizer } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const source = adminDataSource();
	if (source === 'supabase') {
		const live = await getSupabaseOrganizer(params.id);
		if (!live) error(404, 'Organizer profile not found.');
		return { organizer: live.organizer, events: live.events, orders: [], audit: [], source };
	}
	const organizer = getOrganizer(params.id);
	if (!organizer) error(404, 'Organizer not found.');
	const events = eventsForOrganizer(organizer.id);
	return {
		organizer,
		events,
		orders: relatedOrders(events[0]?.id ?? '', 5),
		audit: auditFor(organizer.id, 6),
		source
	};
};

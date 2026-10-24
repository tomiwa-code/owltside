import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eventsForOrganizer, getOrganizer, relatedOrders, auditFor } from '$admin/server/store';

export const load: PageServerLoad = ({ params }) => {
	const organizer = getOrganizer(params.id);
	if (!organizer) error(404, 'Organizer not found.');
	const events = eventsForOrganizer(organizer.id);
	return {
		organizer,
		events,
		orders: relatedOrders(events[0]?.id ?? '', 5),
		audit: auditFor(organizer.id, 6)
	};
};

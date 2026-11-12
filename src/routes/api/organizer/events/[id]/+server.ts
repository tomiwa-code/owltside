import { getSource } from '$lib/server/datasource';
import { redactForPublicClient } from '$lib/server/redact-approval';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The event manager: ledger, orders, check-ins and decisions for one event. */
export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	const organizer = await source.getOrganizer(userId);
	const event = organizer.events.find((item) => item.id === params.id);
	if (!event) error(404, 'Event not found');
	const [tickets, orders, checkins, approvals] = await Promise.all([
		source.getEventTickets(params.id),
		source.getEventOrders(params.id),
		source.getEventCheckins(params.id),
		source
			.listApprovals(userId)
			.then((rows) => rows.map(redactForPublicClient))
			.catch(() => [])
	]);
	return json(
		{ organizer, event, tickets, orders, checkins, approvals },
		{ headers: { 'cache-control': 'private, max-age=10, stale-while-revalidate=30' } }
	);
};

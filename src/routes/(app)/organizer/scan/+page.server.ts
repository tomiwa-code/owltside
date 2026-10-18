import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const organizer = await getSource(createSupabase(cookies)).getOrganizer(
		locals.session?.userId ?? 'demo'
	);
	// The scanner is always reachable: without an event it explains how to set
	// one up instead of bouncing the organizer back to the console.
	const events = organizer.events;
	const requestedEvent = url.searchParams.get('eventId');
	const initialEventId =
		events.find((event) => event.id === requestedEvent)?.id ??
		events.find((event) => (event.gates ?? []).length > 0)?.id ??
		events[0]?.id ??
		'';
	return { organizer: { ...organizer, events }, initialEventId };
};

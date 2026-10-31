import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { isEventClosed } from '$lib/utils/event-status';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const organizer = await getSource(createSupabase(cookies)).getOrganizer(
		locals.session?.userId ?? 'demo'
	);
	// The scanner always opens into the same PIN → camera → scan flow: with an
	// active gated event it settles scans at that gate, and without one
	// (including before any event exists) it arms in standalone terminal mode.
	const events = organizer.events.filter((event) => !isEventClosed(event));
	const requestedEvent = url.searchParams.get('eventId');
	const initialEventId =
		events.find((event) => event.id === requestedEvent)?.id ??
		events.find((event) => (event.gates ?? []).length > 0)?.id ??
		events[0]?.id ??
		'';
	return { organizer: { ...organizer, events }, initialEventId };
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const organizer = await getSource(createSupabase(cookies)).getOrganizer(
		locals.session?.userId ?? 'demo'
	);
	const events = organizer.events.filter((event) => (event.gates ?? []).length > 0);
	if (events.length === 0) redirect(302, '/organizer');
	const requestedEvent = url.searchParams.get('eventId');
	const initialEventId = events.find((event) => event.id === requestedEvent)?.id ?? events[0].id;
	return { organizer: { ...organizer, events }, initialEventId };
};

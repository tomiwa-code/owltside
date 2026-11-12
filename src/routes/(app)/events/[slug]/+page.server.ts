import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	const source = getSource(createSupabase(cookies));
	await source.recordEventView(params.slug);
	const event = await source.getEvent(params.slug);
	if (!event) error(404, 'Event not found');
	// The "message the organizer" state is an optional extra on the page. If its
	// lookup fails, render the event without it rather than failing the whole
	// page with a 500 — this query only runs for signed-in visitors, so a fault
	// here used to look like "event pages are broken for logged-in users".
	const messageRequest = locals.session
		? await source
				.getEventMessageRequest(locals.session.userId, event.id)
				.catch((cause) => {
					console.error('Event message request lookup failed', { slug: params.slug, cause });
					return undefined;
				})
		: undefined;
	return { event, messageRequest: messageRequest ?? null };
};

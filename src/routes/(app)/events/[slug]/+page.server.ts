import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	const source = getSource(createSupabase(cookies));
	const event = await source.getEvent(params.slug);
	if (!event) error(404, 'Event not found');
	const messageRequest = locals.session
		? await source.getEventMessageRequest(locals.session.userId, event.id)
		: undefined;
	return { event, messageRequest: messageRequest ?? null };
};

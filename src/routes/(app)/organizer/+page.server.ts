import { computeOrganizer, getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const payload = await getSource(createSupabase(cookies))
		.getOrganizer(locals.session?.userId ?? 'demo')
		.catch(() => computeOrganizer([], [], [], []));
	return { payload };
};

export const actions: Actions = {
	/** Broadcast an announcement to every ticket owner of one of your events. */
	broadcast: async ({ request, locals, cookies }) => {
		if (!hasOrganizerIdentity(locals.session)) {
			return fail(403, { error: 'Switch to the Organizer role to broadcast announcements.' });
		}
		const userId = locals.session?.userId ?? 'demo';
		const form = await request.formData();
		const message = String(form.get('message') ?? '').trim();
		const eventId = String(form.get('eventId') ?? '').trim();
		if (!message) return fail(400, { error: 'Enter a message to broadcast' });
		if (!eventId) return fail(400, { error: 'Choose the event to announce to' });

		try {
			const source = getSource(createSupabase(cookies));
			const sent = await source.broadcastEvent(userId, eventId, message);
			return { broadcasted: true, sent, eventId };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Could not send broadcast'
			});
		}
	}
};

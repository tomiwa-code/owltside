import { computeOrganizer, getSource } from '$lib/server/datasource';
import { redactForPublicClient } from '$lib/server/redact-approval';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const [payload, approvals] = await Promise.all([
		source.getOrganizer(userId).catch(() => computeOrganizer([], [], [], [])),
		source
			.listApprovals(userId)
			.then((rows) => rows.map(redactForPublicClient))
			.catch(() => [])
	]);
	return { payload, approvals };
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

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const organizer = await source.getOrganizer(userId);
	const event = organizer.events.find((e) => e.id === params.id);
	if (!event) redirect(302, '/organizer');
	const tickets = await source.getEventTickets(params.id);
	const orders = await source.getEventOrders(params.id);
	const checkins = await source.getEventCheckins(params.id);
	return { organizer, event, tickets, orders, checkins };
};

export const actions: Actions = {
	updateEvent: async ({ request, locals, cookies, params }) => {
		const userId = locals.session?.userId ?? 'demo';
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const venue = String(form.get('venue') ?? '').trim();
		const city = String(form.get('city') ?? '').trim();
		const description = String(form.get('description') ?? '').trim();
		if (title.length < 3) return fail(400, { error: 'Title must be at least 3 characters' });
		if (!venue || !city) return fail(400, { error: 'Venue and city are required' });

		try {
			const source = getSource(createSupabase(cookies));
			await source.updateEvent(userId, params.id, { title, venue, city, description });
			return { updated: true };
		} catch (e: any) {
			return fail(400, { error: e?.message ?? 'Could not update event' });
		}
	},

	deleteEvent: async ({ locals, cookies, params }) => {
		const userId = locals.session?.userId ?? 'demo';
		const source = getSource(createSupabase(cookies));
		await source.deleteEvent(userId, params.id);
		redirect(303, '/organizer');
	},

	broadcast: async ({ request, locals, cookies, params }) => {
		const userId = locals.session?.userId ?? 'demo';
		const form = await request.formData();
		const message = String(form.get('message') ?? '').trim();
		if (!message) return fail(400, { error: 'Enter a message to broadcast' });

		try {
			const source = getSource(createSupabase(cookies));
			const sent = await source.broadcastEvent(userId, params.id, message);
			return { broadcasted: true, sent };
		} catch (e: any) {
			return fail(400, { error: e?.message ?? 'Could not send broadcast' });
		}
	}
};

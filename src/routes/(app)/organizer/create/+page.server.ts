import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { owner: locals.session?.userId ?? 'demo' };
};

const draftSchema = z.object({
	title: z.string().min(3, 'Give the event a title').max(80),
	tags: z.array(z.string().min(1).max(24)).max(4).default([]),
	date: z.string().min(8, 'Pick a date'),
	dateEnd: z.string().min(8, 'Pick an end date'),
	venue: z.string().min(2, 'Add a venue'),
	city: z.string().min(2).default('Lagos'),
	description: z.string().max(600).default(''),
	tiers: z
		.array(
			z.object({
				name: z.string().min(1),
				price: z.number().min(0),
				capacity: z.number().int().min(1),
				benefits: z.string().default('')
			})
		)
		.min(1, 'Add at least one ticket tier'),
	days: z
		.array(
			z.object({
				label: z.string(),
				sessions: z.array(
					z.object({ time: z.string(), title: z.string(), stage: z.string() })
				)
			})
		)
		.default([]),
	gates: z.array(z.object({ name: z.string(), staff: z.number().int().min(1) })).default([])
}).refine((draft) => draft.dateEnd >= draft.date, {
	path: ['dateEnd'],
	message: 'End date cannot be before the start date'
});

export const actions: Actions = {
	create: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		let raw: unknown;
		try {
			raw = JSON.parse(String(form.get('draft') ?? '{}'));
		} catch {
			return fail(400, { error: 'Draft could not be read' });
		}
		const parsed = draftSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Check the wizard fields' });
		}
		const d = parsed.data;
		const event = await getSource(createSupabase(cookies)).createEvent(
			locals.session?.userId ?? 'demo',
			{
				title: d.title,
				category: 'conferences',
				tags: d.tags,
				startsAt: `${d.date}T09:00:00`,
				endsAt: `${d.dateEnd}T23:59:00`,
				venue: d.venue,
				city: d.city,
				description: d.description || `${d.title} — details coming soon.`,
				cover: { from: '#2b2a3f', to: '#14131f', icon: 'mic' },
				tiers: d.tiers,
				agenda: d.days.flatMap((day) =>
					day.sessions.map((s) => ({
						start: `${day.label} ${s.time}`,
						title: s.title,
						location: s.stage
					}))
				),
				speakers: [],
				gates: d.gates.map((g, i) => ({
					id: `gate-${i}`,
					name: g.name,
					modes: ['QR', 'Manual'],
					staff: Array.from({ length: g.staff }, (_, s) => `Staff ${s + 1}`)
				}))
			}
		);
		redirect(302, `/organizer/events/${event.id}`);
	}
};

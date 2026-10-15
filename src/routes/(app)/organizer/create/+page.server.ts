import { validateEventPoster } from '$lib/server/event-poster';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { NIGERIAN_STATES } from '$lib/constants/nigeria-states';
import { OPERATING_IDENTITY_COOKIE } from '$lib/constants/operating-identity';
import type { WizardSpeaker } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { owner: locals.session?.userId ?? 'demo' };
};

const draftSchema = z.object({
	poster: z.string().min(1, 'Upload and crop an event poster').max(7_000_000),
	title: z.string().trim().min(3, 'Give the event a title').max(80),
	category: z.string().trim().min(2, 'Choose a category').max(48),
	tags: z.array(z.string().min(1).max(48)).max(1).default([]),
	speakers: z.array(z.object({
		id: z.string().optional(),
		handle: z.string().regex(/^[a-z0-9_]{2,24}$/).optional(),
		name: z.string().trim().min(1).max(80),
		avatarColor: z.string().optional(),
		bio: z.string().max(600).optional(),
		role: z.string().trim().min(2).max(80),
		org: z.string().max(80).optional(),
		tag: z.string().max(48).optional(),
		displayOnly: z.boolean().default(false),
		invited: z.boolean().default(false),
		followers: z.number().int().min(0).optional(),
		following: z.number().int().min(0).optional(),
		city: z.string().max(80).optional()
	})).max(100).default([]),
	date: z.iso.date('Choose a valid start date'),
	dateEnd: z.iso.date('Choose a valid end date'),
	venue: z.string().trim().min(2, 'Add a venue').max(160),
	city: z.enum(NIGERIAN_STATES).default('Lagos'),
	description: z.string().trim().min(10, 'Describe your event in at least 10 characters').max(600),
	tiers: z
		.array(
			z.object({
				name: z.string().trim().min(1, 'Give each ticket tier a name').max(80),
				price: z.number().int('Ticket prices must be whole naira').min(0).max(100_000_000),
				capacity: z.number().int().min(1).max(1_000_000),
				benefits: z.string().default('')
			})
		)
		.min(1, 'Add at least one ticket tier').max(20),
	days: z
		.array(
			z.object({
				label: z.string(),
				sessions: z.array(
					z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid session time'), title: z.string().trim().min(1, 'Add a session title').max(160), stage: z.string().trim().min(1, 'Add a room or stage').max(120) })
				)
			})
		)
		.default([]),
	gates: z.array(z.object({ name: z.string().trim().min(1, 'Name each gate').max(80), staff: z.number().int().min(1).max(100) })).default([])
}).refine((draft) => draft.dateEnd >= draft.date, {
	path: ['dateEnd'],
	message: 'End date cannot be before the start date'
});

export const actions: Actions = {
	create: async ({ request, cookies, locals }) => {
		if (cookies.get(OPERATING_IDENTITY_COOKIE) !== 'organizer') redirect(303, '/settings?identity=organizer-required');
		if (!locals.session) return fail(401, { error: 'Sign in to create an event.' });
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
		const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
		if (d.date < today) return fail(400, { error: 'Start date cannot be in the past.' });
		let poster: string;
		try { poster = await validateEventPoster(d.poster); }
		catch (error) { return fail(400, { error: error instanceof Error ? error.message : 'Upload a valid event poster.' }); }
		let eventId: string;
		try {
			const source = getSource(createSupabase(cookies));
			const speakers: WizardSpeaker[] = [];
			for (const speaker of d.speakers) {
				if (!speaker.invited) {
					// Plain-name entries never claim or link an account, even if a client submits extra fields.
					speakers.push({
						name: speaker.name,
						role: speaker.role,
						bio: speaker.bio ?? '',
						org: 'Display only · no profile linked',
						tag: speaker.role.slice(0, 24),
						displayOnly: true,
						invited: false
					});
					continue;
				}
				if (!speaker.handle || speaker.displayOnly) {
					return fail(400, { error: 'Choose a verified Owltside profile for each invitation' });
				}
				const profile = (await source.searchProfiles(speaker.handle)).find(
					(candidate) => candidate.handle.toLowerCase() === speaker.handle?.toLowerCase()
				);
				if (!profile) return fail(400, { error: `The @${speaker.handle} profile could not be found` });
				speakers.push({
					...speaker,
					id: profile.id,
					handle: profile.handle,
					name: profile.name,
					avatarColor: profile.avatarColor,
					bio: speaker.bio || profile.bio || '',
					followers: profile.followers,
					following: profile.following,
					city: profile.city,
					displayOnly: false,
					invited: true
				});
			}
			const event = await source.createEvent(
				locals.session?.userId ?? 'demo',
				{
					title: d.title,
					category: d.category,
					tags: d.tags,
					startsAt: `${d.date}T09:00:00+01:00`,
					endsAt: `${d.dateEnd}T23:59:00+01:00`,
					venue: d.venue,
					city: d.city,
					description: d.description,
					cover: { from: '#2b2a3f', to: '#14131f', icon: 'image', src: poster },
					tiers: d.tiers,
					agenda: d.days.flatMap((day) =>
						day.sessions.map((s) => ({
							start: `${day.label} ${s.time}`,
							title: s.title,
							location: s.stage
						}))
					),
					speakers,
					gates: d.gates.map((g, i) => ({
						id: `gate-${i}`,
						name: g.name,
						modes: ['QR', 'Manual'],
						staff: Array.from({ length: g.staff }, (_, s) => `Staff ${s + 1}`)
					}))
				}
			);
			eventId = event.id;
		} catch {
			return fail(503, { error: 'Your event could not be published. Your draft is still here. Please try again.' });
		}
		redirect(303, `/organizer/events/${eventId}`);
	}
};

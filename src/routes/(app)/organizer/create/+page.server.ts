import { validateEventPoster } from '$lib/server/event-poster';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { isEventClosed } from '$lib/utils/event-status';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { NIGERIAN_STATES } from '$lib/constants/nigeria-states';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { isValidPromoCode, normalizePromoCode } from '$lib/utils/promo';
import type { WizardSpeaker } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const editId = url.searchParams.get('edit');
	let event;
	if (editId) {
		const organizer = await getSource(createSupabase(cookies)).getOrganizer(locals.session?.userId ?? 'demo');
		event = organizer.events.find((item) => item.id === editId);
		if (!event) redirect(302, '/organizer');
		if (isEventClosed(event)) redirect(302, '/organizer?tab=past');
	}
	return { owner: locals.session?.userId ?? 'demo', event: event ?? null };
};

const draftSchema = z.object({
	poster: z.string().max(7_000_000).default(''),
	title: z.string().trim().min(3, 'Give the event a title').max(80),
	category: z.string().trim().min(2, 'Choose a category').max(48),
	tags: z.array(z.string().min(1).max(48)).max(1).default([]),
	security: z.object({ allowOverride: z.boolean().default(true), allowOffline: z.boolean().default(true), restrictGates: z.boolean().default(true), hmacRotation: z.boolean().default(true), offlineKeyring: z.boolean().default(true), biometricFast: z.boolean().default(true), conflictPolicy: z.enum(['strict', 'flexible']).default('strict') }).default({ allowOverride: true, allowOffline: true, restrictGates: true, hmacRotation: true, offlineKeyring: true, biometricFast: true, conflictPolicy: 'strict' }),
	distribution: z.object({ publishExplore: z.boolean().default(true), broadcast: z.boolean().default(true), launchMode: z.enum(['now', 'staged']).default('now') }).default({ publishExplore: true, broadcast: true, launchMode: 'now' }),
	speakers: z.array(z.object({
		id: z.string().optional(),
		handle: z.string().regex(/^[a-z0-9_]{2,24}$/).optional(),
		name: z.string().trim().min(1).max(80),
		avatarColor: z.string().nullish().transform((v) => v ?? undefined),
		avatarUrl: z.string().nullish().transform((v) => v ?? undefined),
		bio: z.string().max(600).nullish().transform((v) => v ?? undefined),
		role: z.string().trim().min(2).max(80),
		org: z.string().max(80).nullish().transform((v) => v ?? undefined),
		tag: z.string().max(48).nullish().transform((v) => v ?? undefined),
		displayOnly: z.boolean().default(false),
		invited: z.boolean().default(false),
		inviteStatus: z.enum(['pending', 'accepted', 'declined']).optional(),
		followers: z.number().int().min(0).nullish().transform((v) => v ?? undefined),
		following: z.number().int().min(0).nullish().transform((v) => v ?? undefined),
		city: z.string().max(80).nullish().transform((v) => v ?? undefined)
	})).max(100).default([]),
	date: z.iso.date('Choose a valid start date'),
	dateEnd: z.iso.date('Choose a valid end date'),
	timeEnd: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid end time')
		.default('23:59'),
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
	promos: z
		.array(
			z.object({
				code: z
					.string()
					.trim()
					.min(3, 'Promo codes must be at least 3 characters')
					.max(64)
					.transform((value) => normalizePromoCode(value))
					.refine(isValidPromoCode, 'Use 3–24 letters, numbers, hyphens, or underscores for each promo code'),
				percent: z.number().min(1, 'Promo discount must be at least 1%').max(100, 'Promo discount cannot exceed 100%'),
				maxUses: z.number().int('Promo purchases must be a whole number').min(1).max(1_000_000)
			})
		)
		.max(50)
		.default([])
		.refine((promos) => new Set(promos.map((promo) => promo.code)).size === promos.length, {
			message: 'Each promo code can only be added once'
		}),
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
		if (!locals.session) return fail(401, { error: 'Sign in to create an event.' });
		if (!hasOrganizerIdentity(locals.session)) redirect(303, '/settings?identity=organizer-required');
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
		const editId = String(form.get('eventId') ?? '').trim();
		if (d.date < today && !editId) return fail(400, { error: 'Start date cannot be in the past.' });
		const startClock = d.date === d.dateEnd && d.timeEnd < '09:00' ? '00:00' : '09:00';
		const startsAt = `${d.date}T${startClock}:00+01:00`;
		const endsAt = `${d.dateEnd}T${d.timeEnd}:00+01:00`;
		if (Date.parse(endsAt) < Date.parse(startsAt)) {
			return fail(400, { error: 'End date and time cannot be before the start date.' });
		}
		if (!editId && Date.parse(endsAt) <= Date.now()) {
			return fail(400, { error: 'End date and time must be in the future.' });
		}
		let poster: string | undefined;
		let eventId: string;
		try {
			const source = getSource(createSupabase(cookies));
			const organizerId = locals.session?.userId ?? 'demo';
			const existing = editId ? (await source.getOrganizer(organizerId)).events.find((item) => item.id === editId) : undefined;
			if (editId && !existing) return fail(404, { error: 'Event not found' });
			if (existing && isEventClosed(existing)) {
				return fail(400, { error: 'Past events are closed — only payout requests are available.' });
			}
			// Keep the existing remote poster when the wizard merely hydrated its URL;
			// only newly uploaded data URLs need to pass through the image validator.
			if (d.poster && d.poster !== existing?.cover.src) {
				try { poster = await validateEventPoster(d.poster); }
				catch (error) { return fail(400, { error: error instanceof Error ? error.message : 'Upload a valid event poster.' }); }
			} else if (!editId) return fail(400, { error: 'Upload and crop an event poster' });
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
				const previousSpeaker = existing?.speakers.find((current) => current.id === speaker.id || current.handle?.toLowerCase() === speaker.handle?.toLowerCase());
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
					avatarUrl: profile.avatarUrl,
					bio: speaker.bio || profile.bio || '',
					followers: profile.followers,
					following: profile.following,
					city: profile.city,
					displayOnly: false,
					invited: true,
					inviteStatus: previousSpeaker?.inviteStatus ?? 'pending'
				});
			}
			const gatePayload = d.gates.map((g, i) => ({
				id: `gate-${i}`,
				name: g.name,
				modes: ['QR', 'Manual'],
				staff: Array.from({ length: g.staff }, (_, s) => `Staff ${s + 1}`)
			}));
			const payload = {
				title: d.title,
				category: d.category,
				tags: d.tags,
				startsAt,
				endsAt,
				venue: d.venue,
				city: d.city,
				description: d.description,
				cover: poster ? { from: '#2b2a3f', to: '#14131f', icon: 'image', src: poster } : existing!.cover,
				tiers: d.tiers,
				promos: d.promos,
				agenda: d.days.flatMap((day) => day.sessions.map((session) => ({ start: `${day.label} ${session.time}`, title: session.title, location: session.stage }))),
				speakers,
				gates: gatePayload,
				live: d.distribution.launchMode === 'now'
			};
			const event = editId ? await source.updateEvent(organizerId, editId, payload) : await source.createEvent(organizerId, payload);
			eventId = event.id;
		} catch {
			return fail(503, { error: 'Your event could not be submitted for review. Your draft is still here. Please try again.' });
		}
		redirect(303, `/organizer/events/${eventId}`);
	}
};

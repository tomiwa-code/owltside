import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const body = z.object({
	eventId: z.string().min(1),
	code: z.string().min(4).optional(),
	staffToken: z.string().regex(/^\d{6}$/),
	gate: z.string().min(1),
	simulate: z.boolean().default(false)
});

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	const organizer = await source.getOrganizer(userId);

	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid scan request');
	const { eventId, gate, simulate } = parsed.data;

	const event = organizer.events.find((candidate) => candidate.id === eventId);
	if (!event) error(403, 'Not your event');
	if (!event.gates?.some((configured) => configured.name === gate)) error(400, 'Choose a gate configured for this event');
	if (!(await source.verifyGateToken(userId, eventId, gate, parsed.data.staffToken))) error(403, 'Gate PIN is invalid or expired');

	let code = parsed.data.code;
	if (simulate) {
		const tickets = await source.getEventTickets(eventId);
		const open = tickets.find((t) => t.status === 'valid') ?? tickets[0];
		code = open?.code;
		if (!code) error(409, 'No tickets left to scan');
	}

	const checkin = await source.checkInTicket(eventId, code!, gate);
	return json(checkin);
};

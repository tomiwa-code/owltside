import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { z } from 'zod';
import type { Checkin } from '$lib/types';
import type { RequestHandler } from './$types';

// With an event + gate, scans settle at that gate (its staff PIN or the
// organizer's terminal PIN). Without them the scanner runs in standalone
// terminal mode — exactly the same flow before any event exists — and a
// scanned code is resolved against tickets from all of the organizer's
// events. Unknown codes come back invalid either way.
const body = z
	.object({
		eventId: z.string().min(1).optional(),
		code: z.string().min(4).optional(),
		staffToken: z.string().regex(/^\d{6}$/),
		gate: z.string().min(1).optional(),
		simulate: z.boolean().default(false)
	})
	.refine((value) => Boolean(value.eventId) === Boolean(value.gate), {
		message: 'Choose a valid event gate'
	});

/** Gate label recorded for standalone terminal check-ins. */
const TERMINAL_GATE = 'Terminal';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	const organizer = await source.getOrganizer(userId);

	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid scan request');
	const { eventId, gate, simulate } = parsed.data;

	if (eventId && gate) {
		const event = organizer.events.find((candidate) => candidate.id === eventId);
		if (!event) error(403, 'Not your event');
		if (!event.gates?.some((configured) => configured.name === gate)) error(400, 'Choose a gate configured for this event');
		const authorized =
			(await source.verifyGateToken(userId, eventId, gate, parsed.data.staffToken)) ||
			(await source.verifyScannerToken(userId, parsed.data.staffToken));
		if (!authorized) error(403, 'Gate PIN is invalid or expired');

		let code = parsed.data.code;
		if (simulate) {
			const tickets = await source.getEventTickets(eventId);
			const open = tickets.find((t) => t.status === 'valid') ?? tickets[0];
			code = open?.code;
			if (!code) error(409, 'No tickets left to scan');
		}

		const checkin = await source.checkInTicket(eventId, code!, gate);
		return json(checkin);
	}

	/* ── standalone terminal mode: no event/gate context ── */
	if (!(await source.verifyScannerToken(userId, parsed.data.staffToken))) error(403, 'Gate PIN is invalid or expired');

	// Resolve the scan against every event this organizer runs. With no
	// events at all there is nothing to resolve and every code is invalid —
	// the scanner itself (PIN → camera → verdict) works exactly the same.
	let ticketEventId: string | undefined;
	let code = parsed.data.code;
	let simulatedFallback: { eventId: string; code: string } | undefined;
	for (const candidate of organizer.events) {
		const tickets = await source.getEventTickets(candidate.id);
		if (simulate) {
			const open = tickets.find((t) => t.status === 'valid');
			if (open) {
				ticketEventId = candidate.id;
				code = open.code;
				break;
			}
			if (!simulatedFallback && tickets[0]) simulatedFallback = { eventId: candidate.id, code: tickets[0].code };
		} else if (tickets.some((t) => t.code === code)) {
			ticketEventId = candidate.id;
			break;
		}
	}
	if (simulate && !ticketEventId && simulatedFallback) {
		ticketEventId = simulatedFallback.eventId;
		code = simulatedFallback.code;
	}
	if (simulate && !code) error(409, 'No tickets left to scan');

	if (ticketEventId && code) {
		const checkin = await source.checkInTicket(ticketEventId, code, TERMINAL_GATE);
		return json(checkin);
	}

	// No event owns this code — nothing to persist the attempt against, but
	// the terminal still reports the same verdict shape as a gated scan.
	const invalid: Checkin = {
		id: `ck-${code ?? 'unknown'}`,
		eventId: '',
		ticketCode: code ?? '',
		holder: 'Unknown pass',
		tier: '—',
		gate: TERMINAL_GATE,
		at: new Date().toISOString(),
		result: 'invalid'
	};
	return json(invalid);
};

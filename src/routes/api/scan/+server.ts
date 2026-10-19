import { getSource, type StaffScanContext, type StaffScanResolution } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import { z } from 'zod';
import type { Checkin } from '$lib/types';
import type { RequestHandler } from './$types';

// Scans settle three ways, all behind a six-digit staff PIN:
//  1. The scanner user's own event gate (gate PIN or their terminal PIN).
//  2. A shared PIN an organizer handed to door staff — resolved to that
//     organizer's gate/terminal, so helpers with no events can scan for them.
//  3. The scanner user's own standalone terminal (no event context), where
//     codes resolve against tickets from all of their events.
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

function throwStaffScanError(cause: unknown): never {
	const detail = cause && typeof cause === 'object' ? cause as { message?: string; code?: string } : {};
	const message = detail.message ?? (cause instanceof Error ? cause.message : '');
	if (/Gate PIN is invalid or expired/i.test(message)) error(403, 'Gate PIN is invalid or expired');
	if (/No tickets left to scan/i.test(message)) error(409, 'No tickets left to scan');
	if (/Choose a gate configured|Invalid scan request/i.test(message)) error(400, message);
	if (
		/resolve_staff_scan_token|staff_check_in_/i.test(message) ||
		detail.code === '42883' ||
		detail.code === 'PGRST202'
	) {
		error(503, 'Shared scanner PIN support is not installed. Apply supabase/sql/019_shared_staff_scanner.sql, then try again.');
	}
	console.error('Staff scan failed', { code: detail.code, message });
	error(503, 'Scan could not be verified. Please try again.');
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	const organizer = await source.getOrganizer(userId);

	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid scan request');
	const { eventId, gate, simulate } = parsed.data;

	const staffCheckin = async (context: StaffScanContext): Promise<Response> => {
		try {
			const checkin = await source.checkInWithStaffToken({
				context,
				staffToken: parsed.data.staffToken,
				ticketCode: parsed.data.code,
				simulate
			});
			return json(checkin);
		} catch (cause) {
			throwStaffScanError(cause);
		}
	};

	const resolveShared = async (): Promise<StaffScanResolution | null> => {
		try {
			return await source.resolveStaffScanToken(parsed.data.staffToken);
		} catch (cause) {
			throwStaffScanError(cause);
		}
	};

	if (eventId && gate) {
		const ownEvent = organizer.events.find((candidate) => candidate.id === eventId);
		if (ownEvent) {
			if (!ownEvent.gates?.some((configured) => configured.name === gate)) error(400, 'Choose a gate configured for this event');
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

		/* Not the scanner user's event: settle only under a PIN issued for it. */
		const resolution = await resolveShared();
		if (resolution?.kind === 'ambiguous') {
			error(409, 'This PIN matches more than one active scanner. Ask the organizer to generate a new PIN.');
		}
		if (resolution?.kind === 'gate') {
			if (resolution.eventId !== eventId || resolution.gate !== gate) error(403, 'Gate PIN is invalid or expired');
			return staffCheckin(resolution);
		}
		if (resolution?.kind === 'terminal') {
			const target = await source.getOrganizerEvent(eventId).catch(() => undefined);
			if (!target || target.organizer.id !== resolution.organizerId) error(403, 'Gate PIN is invalid or expired');
			if (!target.gates?.some((configured) => configured.name === gate)) error(400, 'Choose a gate configured for this event');
			return staffCheckin(resolution);
		}
		error(403, 'Gate PIN is invalid or expired');
	}

	/* ── standalone terminal mode: no event/gate context ── */
	if (!(await source.verifyScannerToken(userId, parsed.data.staffToken))) {
		const resolution = await resolveShared();
		if (resolution?.kind === 'ambiguous') {
			error(409, 'This PIN matches more than one active scanner. Ask the organizer to generate a new PIN.');
		}
		if (resolution?.kind === 'gate' || resolution?.kind === 'terminal') {
			return staffCheckin(resolution);
		}
		error(403, 'Gate PIN is invalid or expired');
	}

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

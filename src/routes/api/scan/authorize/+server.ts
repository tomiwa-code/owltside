import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getSource, type StaffScanResolution } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { RequestHandler } from './$types';

// A scanner PIN is a bearer credential an organizer can hand to door staff.
// The signed-in user's own gate/terminal PINs are tried first; if the PIN is
// not theirs, it is resolved to the gate (or organizer terminal) it was
// issued for, so a helper with no events of their own arms straight into
// that organizer's event. The resolved context is returned so the scanner
// UI can switch to it.
const bodySchema = z
	.object({
		eventId: z.string().min(1).optional(),
		gate: z.string().trim().min(1).max(80).optional(),
		code: z.string().regex(/^\d{6}$/, 'Enter the six-digit gate PIN')
	})
	.refine((value) => Boolean(value.eventId) === Boolean(value.gate), {
		message: 'Choose a valid event gate'
	});

function throwVerificationError(cause: unknown): never {
	const detail = cause && typeof cause === 'object' ? cause as { message?: string; code?: string } : {};
	const message = detail.message ?? (cause instanceof Error ? cause.message : '');
	if (/organizer_scanner_tokens/i.test(message)) {
		error(503, 'Scanner PIN storage is not installed. Apply supabase/sql/018_organizer_scanner_tokens.sql, then try again.');
	}
	if (
		/resolve_staff_scan_token|staff_check_in_/i.test(message) ||
		detail.code === '42883' ||
		detail.code === 'PGRST202'
	) {
		error(503, 'Shared scanner PIN support is not installed. Apply supabase/sql/019_shared_staff_scanner.sql, then try again.');
	}
	if (detail.code === '42P01' || detail.code === 'PGRST205' || /gate_staff_tokens/i.test(message)) {
		error(503, 'Gate PIN storage is not installed. Apply supabase/sql/014_gate_staff_tokens.sql, then try again.');
	}
	console.error('Gate PIN verification failed', { code: detail.code, message });
	error(503, 'Gate PIN verification is temporarily unavailable.');
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid gate PIN');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	const { eventId, gate, code } = parsed.data;

	let resolution: StaffScanResolution | null = null;
	try {
		const organizer = await source.getOrganizer(userId);
		if (eventId && gate) {
			const ownEvent = organizer.events.find((candidate) => candidate.id === eventId);
			if (ownEvent?.gates?.some((configured) => configured.name === gate)) {
				const ownAuthorized =
					(await source.verifyGateToken(userId, eventId, gate, code)) ||
					(await source.verifyScannerToken(userId, code));
				if (ownAuthorized) return json({ authorized: true });
			}
		} else if (await source.verifyScannerToken(userId, code)) {
			return json({ authorized: true });
		}
		resolution = await source.resolveStaffScanToken(code);
	} catch (cause) {
		throwVerificationError(cause);
	}

	if (resolution?.kind === 'ambiguous') {
		error(409, 'This PIN matches more than one active scanner. Ask the organizer to generate a new PIN.');
	}
	if (resolution?.kind === 'gate') {
		return json({
			authorized: true,
			context: {
				mode: 'shared-gate',
				eventId: resolution.eventId,
				gate: resolution.gate,
				eventTitle: resolution.eventTitle
			}
		});
	}
	if (resolution?.kind === 'terminal') {
		if (resolution.organizerId === userId) return json({ authorized: true });
		return json({ authorized: true, context: { mode: 'shared-terminal' } });
	}
	error(403, 'The gate PIN is invalid or expired');
};

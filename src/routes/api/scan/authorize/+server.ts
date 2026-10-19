import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { RequestHandler } from './$types';

// With an event + gate the PIN may be that gate's staff PIN or the
// organizer's terminal PIN. Without them (standalone terminal mode, e.g.
// before any event exists) only the organizer's terminal PIN arms — a
// gate-specific PIN stays scoped to its gate.
const bodySchema = z
	.object({
		eventId: z.string().min(1).optional(),
		gate: z.string().trim().min(1).max(80).optional(),
		code: z.string().regex(/^\d{6}$/, 'Enter the six-digit gate PIN')
	})
	.refine((value) => Boolean(value.eventId) === Boolean(value.gate), {
		message: 'Choose a valid event gate'
	});

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid gate PIN');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	let valid: boolean;
	try {
		valid =
			parsed.data.eventId && parsed.data.gate
				? (await source.verifyGateToken(userId, parsed.data.eventId, parsed.data.gate, parsed.data.code)) ||
					(await source.verifyScannerToken(userId, parsed.data.code))
				: await source.verifyScannerToken(userId, parsed.data.code);
	} catch (cause) {
		const detail = cause && typeof cause === 'object' ? cause as { message?: string; code?: string } : {};
		const message = detail.message ?? (cause instanceof Error ? cause.message : '');
		if (/organizer_scanner_tokens/i.test(message)) {
			error(503, 'Scanner PIN storage is not installed. Apply supabase/sql/018_organizer_scanner_tokens.sql, then try again.');
		}
		if (detail.code === '42P01' || detail.code === 'PGRST205' || /gate_staff_tokens/i.test(message)) {
			error(503, 'Gate PIN storage is not installed. Apply supabase/sql/014_gate_staff_tokens.sql, then try again.');
		}
		console.error('Gate PIN verification failed', { code: detail.code, message });
		error(503, 'Gate PIN verification is temporarily unavailable.');
	}
	if (!valid) error(403, 'The gate PIN is invalid or expired');
	return json({ authorized: true });
};

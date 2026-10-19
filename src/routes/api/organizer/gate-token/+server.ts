import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { RequestHandler } from './$types';

// With an event + gate this issues that gate's staff PIN. Without them it
// issues the organizer's standalone terminal PIN, which arms the scanner
// even before any event (or gate) exists.
const bodySchema = z
	.object({
		eventId: z.string().min(1).optional(),
		gate: z.string().trim().min(1).max(80).optional()
	})
	.refine((value) => Boolean(value.eventId) === Boolean(value.gate), {
		message: 'Choose a valid event gate'
	});

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Choose a valid event gate');
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	try {
		const token =
			parsed.data.eventId && parsed.data.gate
				? await source.issueGateToken(userId, parsed.data.eventId, parsed.data.gate)
				: await source.issueScannerToken(userId);
		return json({ gate: parsed.data.gate ?? null, ...token });
	} catch (cause) {
		const detail = cause && typeof cause === 'object' ? cause as { message?: string; code?: string } : {};
		const message = detail.message ?? (cause instanceof Error ? cause.message : '');
		if (detail.code === '42P01' || detail.code === 'PGRST205' || /gate_staff_tokens/i.test(message)) {
			error(503, 'Gate PIN storage is not installed. Apply supabase/sql/014_gate_staff_tokens.sql, then try again.');
		}
		if (/organizer_scanner_tokens/i.test(message)) {
			error(503, 'Scanner PIN storage is not installed. Apply supabase/sql/018_organizer_scanner_tokens.sql, then try again.');
		}
		if (detail.code === '42501' || /row-level security|permission denied/i.test(message)) {
			error(403, 'The database denied gate PIN storage. Check the organizer policy in migration 014_gate_staff_tokens.sql.');
		}
		console.error('Gate PIN generation failed', { code: detail.code, message });
		error(503, message || 'Gate PIN generation is temporarily unavailable.');
	}
};

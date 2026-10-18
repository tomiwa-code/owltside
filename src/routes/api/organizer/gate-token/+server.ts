import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ eventId: z.string().min(1), gate: z.string().trim().min(1).max(80) });

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Choose a valid event gate');
	try {
		const token = await getSource(createSupabase(cookies)).issueGateToken(
			locals.session?.userId ?? 'demo',
			parsed.data.eventId,
			parsed.data.gate
		);
		return json({ gate: parsed.data.gate, ...token });
	} catch (cause) {
		const detail = cause && typeof cause === 'object' ? cause as { message?: string; code?: string } : {};
		const message = detail.message ?? (cause instanceof Error ? cause.message : '');
		if (detail.code === '42P01' || detail.code === 'PGRST205' || /gate_staff_tokens/i.test(message)) {
			error(503, 'Gate PIN storage is not installed. Apply supabase/sql/014_gate_staff_tokens.sql, then try again.');
		}
		if (detail.code === '42501' || /row-level security|permission denied/i.test(message)) {
			error(403, 'The database denied gate PIN storage. Check the organizer policy in migration 014_gate_staff_tokens.sql.');
		}
		console.error('Gate PIN generation failed', { code: detail.code, message });
		error(503, message || 'Gate PIN generation is temporarily unavailable.');
	}
};

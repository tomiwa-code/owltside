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
		const message = cause instanceof Error ? cause.message : 'Could not generate a gate PIN';
		error(400, message);
	}
};

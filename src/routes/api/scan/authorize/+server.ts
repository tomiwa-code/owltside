import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	eventId: z.string().min(1),
	gate: z.string().trim().min(1).max(80),
	code: z.string().regex(/^\d{6}$/, 'Enter the six-digit gate PIN')
});

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!hasOrganizerIdentity(locals.session)) error(403, 'Organizer identity required');
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid gate PIN');
	const source = getSource(createSupabase(cookies));
	const valid = await source.verifyGateToken(
		locals.session?.userId ?? 'demo',
		parsed.data.eventId,
		parsed.data.gate,
		parsed.data.code
	);
	if (!valid) error(403, 'The gate PIN is invalid or expired');
	return json({ authorized: true });
};

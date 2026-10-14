import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const failure = (error: unknown, fallback: string) =>
	json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	if (!locals.session) return json({ error: 'Sign in to respond to this invitation.' }, { status: 401 });

	let payload: { accept?: unknown };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}
	if (typeof payload.accept !== 'boolean') {
		return json({ error: 'Choose whether to accept or decline the invitation.' }, { status: 400 });
	}

	try {
		const status = await getSource(createSupabase(cookies)).respondToSpeakerInvite(
			locals.session.userId,
			params.slug,
			payload.accept
		);
		return json({ status }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (error) {
		return failure(error, 'Your invitation response could not be saved');
	}
};

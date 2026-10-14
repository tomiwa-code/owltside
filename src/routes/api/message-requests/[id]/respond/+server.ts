import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	if (!locals.session) return json({ error: 'Sign in to respond to requests.' }, { status: 401 });
	let payload: { accept?: unknown };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}
	if (typeof payload.accept !== 'boolean') return json({ error: 'Choose whether to accept the request.' }, { status: 400 });
	try {
		const messageRequest = await getSource(createSupabase(cookies)).respondToMessageRequest(
			locals.session.userId,
			params.id,
			payload.accept
		);
		return json({ request: messageRequest });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Could not update the message request.' }, { status: 400 });
	}
};

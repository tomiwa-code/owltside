import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Acknowledge a thread's messages (called when its chat screen is opened). */
export const POST: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.session) return json({ error: 'Sign in to update chats.' }, { status: 401 });
	await getSource(createSupabase(cookies)).markConversationRead(params.id);
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};

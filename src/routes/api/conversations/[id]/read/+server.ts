import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Acknowledge a thread for the signed-in receiver. Called only when the chat
 * screen is actively opened — never while it merely stays mounted — and only
 * clears this reader's unread counter.
 */
export const POST: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.session) return json({ error: 'Sign in to update chats.' }, { status: 401 });
	const source = getSource(createSupabase(cookies));
	await source.markConversationRead(params.id, locals.session.userId);
	// Return the post-acknowledgement list: it keeps the shared cache on the
	// server's numbers (including anything that arrived after the open) instead
	// of guessing locally.
	// Null (not []) when the refresh fails: the client keeps its optimistic
	// numbers instead of wiping every badge.
	const conversations = await source.getConversations(locals.session.userId).catch(() => null);
	return json({ ok: true, conversations }, { headers: { 'cache-control': 'no-store' } });
};

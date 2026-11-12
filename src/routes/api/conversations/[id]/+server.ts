import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * One conversation, for the thread route. The inbox list is paged, so a thread
 * opened from a notification may not be in `/api/conversations`; this resolves
 * it by id without forcing the whole list to grow.
 */
export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	const userId = locals.session?.userId ?? 'demo';
	const source = getSource(createSupabase(cookies));
	const conversations = await source.getConversations(userId);
	const conversation =
		conversations.find((item) => item.id === params.id) ??
		(await source.getConversation(userId, params.id));
	if (!conversation) error(404, 'Conversation not found');
	return json(conversation, {
		headers: { 'cache-control': 'private, max-age=15, stale-while-revalidate=30' }
	});
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Header badge counters.
 *
 * The header needs three numbers. It used to poll `/api/notifications`,
 * `/api/conversations` and `/api/message-requests` — three full payloads,
 * every few seconds, on every page — to compute them. This endpoint answers
 * with a few dozen bytes, so polling it is effectively free, and the full
 * lists are only fetched when the user actually opens the inbox/hub.
 */
export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.session?.userId) {
		return json({ unread: 0, inboxUnread: 0, requests: 0 }, { headers: { 'cache-control': 'no-store' } });
	}
	try {
		const counts = await getSource(createSupabase(cookies)).getBadgeCounts(locals.session.userId);
		return json(counts, { headers: { 'cache-control': 'private, no-store' } });
	} catch {
		// Never mask the server numbers with an error object in the header.
		return json({ error: 'Badges unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};

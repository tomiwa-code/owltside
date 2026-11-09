import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * One page of a thread (newest `limit` messages, returned oldest-first).
 * `?before=<iso>` pages backwards through history.
 */
export const GET: RequestHandler = async ({ params, locals, cookies, url }) => {
	if (!locals.session?.userId) {
		return json({ error: 'Sign in to view this conversation.' }, { status: 401 });
	}
	const limitRaw = Number(url.searchParams.get('limit') ?? 0);
	const before = url.searchParams.get('before') ?? undefined;
	// RLS restricts the rows to participants; this check keeps guests out entirely.
	const items = await getSource(createSupabase(cookies)).getMessages(params.id, {
		...(Number.isFinite(limitRaw) && limitRaw > 0 ? { limit: Math.min(limitRaw, 100) } : {}),
		...(before ? { before } : {})
	});
	return json(items, { headers: { 'cache-control': 'private, no-store' } });
};

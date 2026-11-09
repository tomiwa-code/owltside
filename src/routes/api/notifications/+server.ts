import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	const userId = locals.session?.userId ?? 'demo';
	const limit = Number(url.searchParams.get('limit') ?? 0);
	const offset = Number(url.searchParams.get('offset') ?? 0);
	const items = await getSource(createSupabase(cookies)).getNotifications(userId, {
		...(Number.isFinite(limit) && limit > 0 ? { limit: Math.min(limit, 100) } : {}),
		...(Number.isFinite(offset) && offset > 0 ? { offset } : {})
	});
	// `private` keeps it out of shared caches; `max-age=30` lets the browser
	// answer an immediate re-mount (e.g. back navigation) without a request.
	return json(items, { headers: { 'cache-control': 'private, max-age=30, stale-while-revalidate=60' } });
};

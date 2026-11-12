import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Best-effort view counter, fired once when the event page mounts. */
export const POST: RequestHandler = async ({ params, cookies }) => {
	await getSource(createSupabase(cookies)).recordEventView(params.slug).catch(() => undefined);
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};

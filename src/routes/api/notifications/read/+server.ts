import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Acknowledge the whole notification stream (called when the hub is opened). */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.session) return json({ error: 'Sign in to update notifications.' }, { status: 401 });
	await getSource(createSupabase(cookies)).markAllNotificationsRead(locals.session.userId);
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};

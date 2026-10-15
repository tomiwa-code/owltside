import { json } from '@sveltejs/kit';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.session) return json({ error: 'Sign in to follow people.' }, { status: 401 });
	if (params.id === locals.session.userId) return json({ error: 'You cannot follow yourself.' }, { status: 400 });
	let body;
	try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, { status: 400 }); }
	if (!body || typeof body.following !== 'boolean') return json({ error: 'Choose follow or unfollow.' }, { status: 400 });
	try {
		await getSource(createSupabase(cookies)).setFollow(locals.session.userId, params.id, body.following);
		return json({ following: body.following });
	} catch {
		return json({ error: 'Could not update follow status. Please try again.' }, { status: 503 });
	}
};

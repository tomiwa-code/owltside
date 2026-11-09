import { createSupabase } from '$lib/server/supabase';
import { imageResponse } from '$lib/server/media';
import type { RequestHandler } from './$types';

/**
 * Serve a profile avatar from its stored inline image.
 *
 * Only the `avatar_url` column is read, and the response is cached for a week
 * (a year at the CDN) keyed by the `v` fingerprint in the URL. Replacing the
 * photo changes the fingerprint, so `immutable` stays correct.
 */
export const GET: RequestHandler = async ({ params, request, cookies }) => {
	const db = createSupabase(cookies);
	if (!db) return new Response(null, { status: 404 });
	const { data } = await db
		.from('profiles')
		.select('avatar_url')
		.eq('handle', params.handle)
		.maybeSingle();
	return imageResponse(data?.avatar_url, request);
};

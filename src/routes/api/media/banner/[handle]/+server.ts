import { createSupabase } from '$lib/server/supabase';
import { imageResponse } from '$lib/server/media';
import type { RequestHandler } from './$types';

/** Serve a profile banner from its stored inline image (see avatar route). */
export const GET: RequestHandler = async ({ params, request, cookies }) => {
	const db = createSupabase(cookies);
	if (!db) return new Response(null, { status: 404 });
	const { data } = await db
		.from('profiles')
		.select('banner_url')
		.eq('handle', params.handle)
		.maybeSingle();
	return imageResponse(data?.banner_url, request);
};

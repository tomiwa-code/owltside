import { createSupabase } from '$lib/server/supabase';
import { imageResponse } from '$lib/server/media';
import type { RequestHandler } from './$types';

/** Serve an event poster from its stored inline image (`events.cover->>src`). */
export const GET: RequestHandler = async ({ params, request, cookies }) => {
	const db = createSupabase(cookies);
	if (!db) return new Response(null, { status: 404 });
	const { data } = await db.from('events').select('cover').eq('slug', params.slug).maybeSingle();
	let cover: unknown = data?.cover;
	if (typeof cover === 'string') {
		try {
			cover = JSON.parse(cover);
		} catch {
			cover = { src: cover };
		}
	}
	const src =
		cover && typeof cover === 'object' ? (cover as Record<string, unknown>).src : undefined;
	return imageResponse(src, request);
};

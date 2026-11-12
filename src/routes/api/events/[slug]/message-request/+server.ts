import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The signed-in visitor's first-contact state for one event. Kept out of the
 * public event payload so that response stays cacheable for everyone.
 */
export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.session?.userId) return json({ request: null }, { headers: { 'cache-control': 'private, no-store' } });
	const source = getSource(createSupabase(cookies));
	const event = await source.getEvent(params.slug);
	if (!event) return json({ request: null }, { headers: { 'cache-control': 'private, no-store' } });
	const request = await source
		.getEventMessageRequest(locals.session.userId, event.id)
		.catch((cause) => {
			console.error('Event message request lookup failed', { slug: params.slug, cause });
			return undefined;
		});
	return json({ request: request ?? null }, { headers: { 'cache-control': 'private, no-store' } });
};

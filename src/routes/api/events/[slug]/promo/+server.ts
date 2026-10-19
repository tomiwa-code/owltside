import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { normalizePromoCode } from '$lib/utils/promo';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	let payload: { code?: unknown };
	try {
		payload = await request.json();
	} catch {
		return json({ valid: false, error: 'Request body must be valid JSON.' }, { status: 400 });
	}

	const code = typeof payload.code === 'string' ? normalizePromoCode(payload.code) : '';
	if (!code || code.length > 64) {
		return json({ valid: false, error: 'Enter a promo code.' }, { status: 400 });
	}

	const source = getSource(createSupabase(cookies));
	const event = await source.getEvent(params.slug);
	if (!event) return json({ valid: false, error: 'Event not found.' }, { status: 404 });

	try {
		const promo = await source.resolvePromoCode(params.slug, code);
		if (!promo) {
			return json(
				{ valid: false, error: 'That code isn’t valid for this event' },
				{ status: 400, headers: { 'cache-control': 'private, no-store' } }
			);
		}
		return json(
			{ valid: true, promo },
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (caught) {
		const message = caught instanceof Error ? caught.message : 'Promo code could not be checked.';
		return json(
			{ valid: false, error: message },
			{ status: message.includes('020_event_promos.sql') ? 503 : 400 }
		);
	}
};

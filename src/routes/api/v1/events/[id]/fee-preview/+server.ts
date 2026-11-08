import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import { adminDb } from '$lib/server/fee-api';
import { calculateFeeQuote, loadFeeConfiguration, logFeeQuote } from '$lib/server/fees';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.session?.userId) return json({ error: 'Sign in required' }, { status: 401 });
	const db = createSupabase(cookies);
	if (!db) return json({ error: 'Database is not configured' }, { status: 503 });
	const { data: event, error } = await db.from('events').select('id,organizer_id,fee_bearer,tiers').eq('id', params.id).maybeSingle();
	if (error) return json({ error: error.message }, { status: 503 });
	if (!event || event.organizer_id !== locals.session.userId) return json({ error: 'Event not found' }, { status: 404 });
	try {
		const serviceDb = adminDb();
		const config = await loadFeeConfiguration(serviceDb);
		const tiers = (Array.isArray(event.tiers) ? event.tiers : []).map((tier: Record<string, unknown>) => {
			const ticketPriceKobo = Math.round(Number(tier.price) * 100);
			return { tierId: tier.id, tierName: tier.name, ...calculateFeeQuote({ ticketPriceKobo, feeBearer: event.fee_bearer, ...config }) };
		});
		await Promise.all(tiers.map(({ tierId: _id, tierName: _name, ...quote }) => logFeeQuote(serviceDb, {
			quote, quantity: 1, organizerId: event.organizer_id, eventId: event.id
		})));
		return json({ eventId: event.id, feeBearer: event.fee_bearer, currency: config.policy.currency, tiers }, { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		return json({ error: cause instanceof Error ? cause.message : 'Could not calculate fee preview' }, { status: 503 });
	}
};

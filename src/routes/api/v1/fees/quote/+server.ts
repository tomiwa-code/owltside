import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getEventForFee, optionalAdminDb } from '$lib/server/fee-api';
import { createSupabase } from '$lib/server/supabase';
import { resolveFeeConfiguration } from '$lib/server/fee-config';
import { calculateFeeQuote, defaultFeeConfiguration, logFeeQuote, type FeeBearer } from '$lib/server/fees';

const schema = z.object({
	ticketPriceKobo: z.number().int().min(0).max(100_000_000_000),
	quantity: z.number().int().min(1).max(100).default(1),
	feeBearer: z.enum(['ABSORB', 'PASS']).optional(),
	organizerId: z.string().max(80).optional(), eventId: z.string().min(1).max(80).optional(),
	currency: z.literal('NGN').default('NGN')
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Display-only fee quote. The amount a buyer is actually charged is computed by
 * `create_pending_order` in Postgres, so this route must never be the reason a
 * ticket page shows "Service fee: Unavailable": if the fee configuration
 * cannot be read it degrades to the documented seed defaults (see
 * `resolveFeeConfiguration`) and says why in the log.
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid fee quote request' }, { status: 400 });
	const input = parsed.data;
	try {
		let bearer: FeeBearer = input.feeBearer ?? 'PASS';
		let organizerId = input.organizerId ?? null;
		if (input.eventId && UUID_RE.test(input.eventId) && !locals.demoMode) {
			const event = await getEventForFee(cookies, input.eventId);
			if (!event) return json({ error: 'Event not found' }, { status: 404 });
			if (organizerId && organizerId !== event.organizer_id) return json({ error: 'Organizer does not own this event' }, { status: 403 });
			organizerId = event.organizer_id;
			bearer = (event.fee_bearer as FeeBearer | null) ?? bearer;
		}
		// Demo mode has no database. A real deployment may or may not have a
		// service-role key, so resolve the configuration instead of requiring
		// one particular client.
		const resolved = locals.demoMode
			? { config: defaultFeeConfiguration(), source: 'demo' as const, reason: null }
			: await resolveFeeConfiguration({ admin: optionalAdminDb(), request: createSupabase(cookies) });
		if (resolved.source === 'defaults') {
			console.warn('Fee quote fell back to the seed fee configuration', { reason: resolved.reason });
		} else if (resolved.source === 'rpc') {
			console.info('Fee quote read its configuration through public.fee_quote_config()');
		}
		const unit = calculateFeeQuote({ ticketPriceKobo: input.ticketPriceKobo, feeBearer: bearer, ...resolved.config });
		const quantity = input.quantity;
		const multiplied = (amount: number) => {
			const total = BigInt(amount) * BigInt(quantity);
			if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Fee quote total exceeds the supported kobo range');
			return Number(total);
		};
		const total = {
			ticketPriceKobo: multiplied(unit.ticketPriceKobo),
			platformFeeKobo: multiplied(unit.platformFeeKobo),
			processingFeeKobo: multiplied(unit.processingFeeKobo),
			buyerTotalKobo: multiplied(unit.buyerTotalKobo),
			organizerNetKobo: multiplied(unit.organizerNetKobo)
		};
		const idempotencyKey = request.headers.get('idempotency-key')?.trim().slice(0, 180) || null;
		const loggedOrganizerId = organizerId && UUID_RE.test(organizerId) ? organizerId : null;
		const loggedEventId = input.eventId && UUID_RE.test(input.eventId) ? input.eventId : null;
		const audit = { quote: unit, quantity, organizerId: loggedOrganizerId, eventId: loggedEventId, idempotencyKey };
		// The audit row is bookkeeping: a buyer's fee breakdown must never fail
		// because it could not be written.
		const db = locals.demoMode ? null : optionalAdminDb();
		if (db) {
			try {
				await logFeeQuote(db, audit);
			} catch (cause) {
				console.error('Fee quote audit failed', cause);
			}
		} else if (locals.demoMode) {
			console.info('Demo fee quote audit', audit);
		}
		return json({ currency: unit.currency, quantity, unit, totals: total }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('Fee quote failed', error);
		return json({ error: 'Ticket fees are temporarily unavailable. Please try again shortly.' }, { status: 503 });
	}
};

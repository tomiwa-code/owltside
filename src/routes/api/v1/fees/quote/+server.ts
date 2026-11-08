import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { adminDb, getEventForFee } from '$lib/server/fee-api';
import { calculateFeeQuote, DEFAULT_FEE_POLICY, DEFAULT_FEE_RULES, loadFeeConfiguration, logFeeQuote, type FeeBearer } from '$lib/server/fees';

const schema = z.object({
	ticketPriceKobo: z.number().int().min(0).max(100_000_000_000),
	quantity: z.number().int().min(1).max(100).default(1),
	feeBearer: z.enum(['ABSORB', 'PASS']).optional(),
	organizerId: z.string().max(80).optional(), eventId: z.string().min(1).max(80).optional(),
	currency: z.literal('NGN').default('NGN')
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
			bearer = event.fee_bearer;
		}
		const db = locals.demoMode ? null : adminDb();
		const config = db ? await loadFeeConfiguration(db) : { rules: DEFAULT_FEE_RULES, policy: DEFAULT_FEE_POLICY };
		const unit = calculateFeeQuote({ ticketPriceKobo: input.ticketPriceKobo, feeBearer: bearer, ...config });
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
		if (db) await logFeeQuote(db, { quote: unit, quantity, organizerId: loggedOrganizerId, eventId: loggedEventId, idempotencyKey });
		else console.info('Demo fee quote audit', { quote: unit, quantity, organizerId: loggedOrganizerId, eventId: loggedEventId, idempotencyKey });
		return json({ currency: unit.currency, quantity, unit, totals: total }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('Fee quote failed', error);
		return json({ error: error instanceof Error ? error.message : 'Could not calculate fees' }, { status: 503 });
	}
};

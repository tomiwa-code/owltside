import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import {
	paystackConfigured,
	paystackSecretConfigured,
	resolvePaystackPublicKey,
	initializeTransaction
} from '$lib/server/paystack';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { computeTotals } from '$lib/server/promos';
import { hasEventEnded } from '$lib/utils/event-status';
import { normalizePromoCode } from '$lib/utils/promo';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('event');
	if (!slug) error(400, 'Missing event');
	/* Buying requires an account: unregistered visitors are asked to sign
	   in and returned to this exact checkout afterwards. */
	if (!locals.session?.userId) {
		redirect(303, `/auth/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
	}
	const source = getSource(createSupabase(cookies));
	const event = await source.getEvent(slug);
	if (!event) error(404, 'Event not found');
	if (hasEventEnded(event) || event.status === 'closed') {
		redirect(303, `/events/${encodeURIComponent(slug)}`);
	}
	const tierId = url.searchParams.get('tier') ?? event.tiers.find((t) => t.capacity - t.sold > 0)?.id;
	const tier = event.tiers.find((t) => t.id === tierId) ?? event.tiers[0];
	const qty = Math.max(1, Math.min(6, Number(url.searchParams.get('qty') ?? 1)));
	const promoParam = normalizePromoCode(url.searchParams.get('promo'));
	const promo = promoParam ? await source.resolvePromoCode(slug, promoParam) : null;
	return {
		event,
		tierId: tier.id,
		qty,
		promo,
		/* Stable per-render key so a double submit resumes the same order
		   instead of opening a second chargeable transaction. */
		checkoutKey: crypto.randomUUID(),
		paystack: paystackConfigured(),
		paystackPublicKey: resolvePaystackPublicKey() || null,
		demoMode: locals.demoMode,
		holder: {
			name: locals.session?.name ?? 'Guest Explorer',
			email: locals.session?.email ?? 'guest@owltside.app',
			authenticated: Boolean(locals.session?.userId)
		}
	};
};

export const actions: Actions = {
	pay: async ({ request, locals, cookies, url }) => {
		const form = await request.formData();
		const slug = String(form.get('event') ?? '');
		const tierId = String(form.get('tier') ?? '');
		const qty = Math.max(1, Math.min(6, Number(form.get('qty') ?? 1)));
		const promoCode = normalizePromoCode(String(form.get('promo') ?? '')) || null;
		const scenario = String(form.get('scenario') ?? 'approve');
		const pageKey = String(form.get('checkoutKey') ?? '').trim();

		const source = getSource(createSupabase(cookies));
		if (!locals.session?.userId) {
			const backToCheckout = `/checkout?event=${encodeURIComponent(slug)}&tier=${encodeURIComponent(tierId)}&qty=${qty}${promoCode ? `&promo=${encodeURIComponent(promoCode)}` : ''}`;
			redirect(303, `/auth/login?next=${encodeURIComponent(backToCheckout)}`);
		}
		const userId = locals.session.userId;

		const event = await source.getEvent(slug);
		if (!event) return fail(404, { error: 'Event not found' });
		if (hasEventEnded(event) || event.status === 'closed') {
			return fail(400, { error: 'This event has ended — ticket sales are closed' });
		}
		const tier = event.tiers.find((t) => t.id === tierId);
		if (!tier) return fail(400, { error: 'Unknown tier' });

		const resolvedPromo = promoCode ? await source.resolvePromoCode(slug, promoCode) : null;
		if (promoCode && !resolvedPromo) {
			return fail(400, {
				error: 'That code isn’t valid for this event',
				totals: computeTotals(tier.price, qty, null)
			});
		}
		const totals = computeTotals(tier.price, qty, resolvedPromo);

		/* Demo mode has no gateway: it mints a local ticket so the sandbox flow
		   still works end to end. Nothing here touches real money. */
		if (source.mode === 'demo') {
			if (scenario === 'decline') {
				return fail(402, { error: 'declined', totals });
			}
			const order = await source.createOrder(userId, slug, [{ tierId, qty }], promoCode);
			redirect(303, `/tickets/${order.tickets[0].id}?new=1`);
		}

		/* 1. Reserve capacity and create a pending order on the server. The
		      order carries the amount; nothing about money comes from the client. */
		const idempotencyKey = `${pageKey || 'checkout'}:${slug}:${tierId}:${qty}:${promoCode ?? '-'}`.slice(0, 180);

		let intent;
		try {
			intent = await source.createPendingOrder(userId, slug, [{ tierId, qty }], promoCode, idempotencyKey);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'Could not start checkout. Please try again.';
			console.error('Checkout intent failed', { slug, message });
			return fail(400, { error: message, totals });
		}

		/* 2. Free passes (or a 100% promo) need no gateway. */
		if (intent.amountKobo <= 0) {
			let freeTicketId: string | undefined;
			try {
				const fulfilment = await source.claimFreeOrder(userId, intent.reference);
				freeTicketId = fulfilment.tickets[0]?.id;
			} catch (cause) {
				console.error('Free pass fulfilment failed', {
					reference: intent.reference,
					message: cause instanceof Error ? cause.message : String(cause)
				});
			}
			if (!freeTicketId) return fail(400, { error: 'Could not issue your pass. Please try again.', totals });
			redirect(303, `/tickets/${freeTicketId}?new=1`);
		}

		/* 3. Hand off to Paystack with the server-computed amount and reference. */
		if (!paystackSecretConfigured()) {
			return fail(503, {
				error: 'Card payments are temporarily unavailable. Please try again shortly.',
				totals
			});
		}

		const callbackUrl = `${(url.origin || '').replace(/\/$/, '')}/checkout/success?ref=${encodeURIComponent(intent.reference)}`;
		let authorizationUrl: string;
		try {
			const init = await initializeTransaction({
				email: locals.session.email || 'guest@owltside.app',
				amountKobo: intent.amountKobo,
				reference: intent.reference,
				callbackUrl,
				metadata: {
					event: event.title,
					tier: tier.name,
					qty: String(qty),
					orderId: intent.orderId
				}
			});
			authorizationUrl = init.authorizationUrl;
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'The payment gateway could not be reached.';
			console.error('Paystack initialization failed', { reference: intent.reference, message });
			return fail(502, { error: 'The payment gateway could not be reached. Please try again.', totals });
		}
		// Outside the try: SvelteKit's redirect is a thrown control-flow object.
		redirect(303, authorizationUrl);
	}
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import {
	paystackConfigured,
	paystackSecretConfigured,
	resolvePaystackPublicKey,
	initializeTransaction,
	verifyTransaction
} from '$lib/server/paystack';
import { toKobo } from '$lib/utils/money';
import { env as publicEnv } from '$env/dynamic/public';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { computeTotals } from '$lib/server/promos';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const slug = url.searchParams.get('event');
	if (!slug) error(400, 'Missing event');
	const source = getSource(createSupabase(cookies));
	const event = await source.getEvent(slug);
	if (!event) error(404, 'Event not found');
	const tierId = url.searchParams.get('tier') ?? event.tiers.find((t) => t.capacity - t.sold > 0)?.id;
	const tier = event.tiers.find((t) => t.id === tierId) ?? event.tiers[0];
	const qty = Math.max(1, Math.min(6, Number(url.searchParams.get('qty') ?? 1)));
	const promoParam = (url.searchParams.get('promo') ?? '').toUpperCase();
	return {
		event,
		tierId: tier.id,
		qty,
		promo: promoParam === 'TECHCOMMUNITY' || promoParam === 'OWL10' ? promoParam : null,
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
		const promo = String(form.get('promo') ?? '').toUpperCase() || null;
		const scenario = String(form.get('scenario') ?? 'approve');
		const paystackReference = String(form.get('paystackReference') ?? '').trim();

		const source = getSource(createSupabase(cookies));
		if (source.mode === 'supabase' && !locals.session?.userId) {
			redirect(303, '/auth/login');
		}
		const event = await source.getEvent(slug);
		if (!event) return fail(404, { error: 'Event not found' });
		const tier = event.tiers.find((t) => t.id === tierId);
		if (!tier) return fail(400, { error: 'Unknown tier' });

		const totals = computeTotals(tier.price, qty, promo);

		// 1. If the client completed payment via Paystack Inline Popup, verify (if secret key present) and mint ticket
		if (paystackReference) {
			if (paystackSecretConfigured()) {
				const paid = await verifyTransaction(paystackReference);
				if (!paid) {
					return fail(402, { error: 'Payment could not be verified with Paystack.', totals });
				}
			}
			const order = await source.createOrder(locals.session?.userId ?? 'demo', slug, [{ tierId, qty }]);
			redirect(303, `/tickets/${order.tickets[0].id}?new=1`);
		}

		// 2. Real gateway hosted checkout fallback (when Paystack secret key is active and ticket is paid)
		if (paystackSecretConfigured() && totals.total > 0) {
			const reference = `OWT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
			const init = await initializeTransaction({
				email: locals.session?.email ?? 'guest@owltside.app',
				amountKobo: toKobo(totals.total),
				reference,
				callbackUrl: `${publicEnv.PUBLIC_APP_URL || url.origin}/checkout/success?ref=${reference}&slug=${encodeURIComponent(slug)}&tier=${encodeURIComponent(tierId)}&qty=${qty}`
			});
			redirect(303, init.authorizationUrl);
		}

		// 3. Demo sandbox decline simulation
		if (source.mode === 'demo' && scenario === 'decline') {
			return fail(402, { error: 'declined', totals });
		}

		const order = await source.createOrder(locals.session?.userId ?? 'demo', slug, [{ tierId, qty }]);
		redirect(303, `/tickets/${order.tickets[0].id}?new=1`);
	}
};

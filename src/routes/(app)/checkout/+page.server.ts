import { minPrice, getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { paystackConfigured, initializeTransaction } from '$lib/server/paystack';
import { toKobo } from '$lib/utils/money';
import { env } from '$env/dynamic/private';
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
		holder: {
			name: locals.session?.name ?? 'Guest Explorer',
			email: locals.session?.email ?? 'guest@owltside.app'
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
		const method = String(form.get('method') ?? 'card');
		const scenario = String(form.get('scenario') ?? 'approve');

		const source = getSource(createSupabase(cookies));
		const event = await source.getEvent(slug);
		if (!event) return fail(404, { error: 'Event not found' });
		const tier = event.tiers.find((t) => t.id === tierId);
		if (!tier) return fail(400, { error: 'Unknown tier' });

		const totals = computeTotals(tier.price, qty, promo);

		// Real gateway path (when Paystack is active and ticket is paid)
		if (paystackConfigured() && totals.total > 0) {
			const reference = `OWT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
			const init = await initializeTransaction({
				email: locals.session?.email ?? 'guest@owltside.app',
				amountKobo: toKobo(totals.total),
				reference,
				callbackUrl: `${env.PUBLIC_APP_URL ?? url.origin}/checkout/success?ref=${reference}&slug=${encodeURIComponent(slug)}&tier=${encodeURIComponent(tierId)}&qty=${qty}`
			});
			redirect(303, init.authorizationUrl);
		}

		// Demo sandbox decline simulation
		if (source.mode === 'demo' && scenario === 'decline') {
			return fail(402, { error: 'declined', totals });
		}

		const order = await source.createOrder(locals.session?.userId ?? 'demo', slug, [{ tierId, qty }]);
		redirect(303, `/tickets/${order.tickets[0].id}?new=1`);
	}
};

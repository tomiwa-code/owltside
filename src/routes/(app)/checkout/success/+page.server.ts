import { error, redirect } from '@sveltejs/kit';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { paystackSecretConfigured, verifyTransaction } from '$lib/server/paystack';
import { normalizePromoCode } from '$lib/utils/promo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies, locals }) => {
	const ref = url.searchParams.get('ref') || url.searchParams.get('reference') || url.searchParams.get('trxref');
	const slug = url.searchParams.get('slug') || url.searchParams.get('event');
	const tierId = url.searchParams.get('tier');
	const qty = Math.max(1, Math.min(6, Number(url.searchParams.get('qty') ?? 1)));
	const promoCode = normalizePromoCode(url.searchParams.get('promo')) || null;

	if (!ref || !slug || !tierId) {
		redirect(303, '/tickets');
	}

	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';

	if (paystackSecretConfigured()) {
		const paid = await verifyTransaction(ref);
		if (!paid) {
			error(400, 'Payment verification failed. If your card was charged, contact support.');
		}
	}

	const order = await source.createOrder(userId, slug, [{ tierId, qty }], promoCode);
	if (order && order.tickets && order.tickets.length > 0) {
		redirect(303, `/tickets/${order.tickets[0].id}?new=1`);
	}

	redirect(303, '/tickets');
};

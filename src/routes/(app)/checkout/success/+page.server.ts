import { error, redirect } from '@sveltejs/kit';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { paystackSecretConfigured, verifyTransactionDetails } from '$lib/server/paystack';
import type { PageServerLoad } from './$types';

/**
 * Gateway return handler.
 *
 * The only thing taken from the URL is the reference. Tier, quantity, event and
 * amount all come from the pending order the server created before the
 * redirect, and the payment is re-verified with Paystack before anything is
 * minted. Fulfilment is idempotent (one reference is consumed once), so a
 * refresh, a back-button or a webhook that arrived first cannot duplicate
 * tickets.
 */
export const load: PageServerLoad = async ({ url, cookies, locals }) => {
	const ref = url.searchParams.get('ref') || url.searchParams.get('reference') || url.searchParams.get('trxref');

	if (!ref) redirect(303, '/tickets');

	/* Tickets are minted to a registered account. If the session is gone
	   when the gateway returns, ask the buyer to sign in and resume here. */
	if (!locals.session?.userId) {
		redirect(303, `/auth/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
	}

	const source = getSource(createSupabase(cookies));
	if (source.mode === 'demo') redirect(303, '/tickets');

	if (!paystackSecretConfigured()) {
		error(503, 'Payment verification is not configured. Contact support before retrying.');
	}

	/* Ask Paystack, not the browser, what was paid. */
	const verified = await verifyTransactionDetails(ref);
	if (!verified) {
		error(400, 'Payment verification failed. If your card was charged, contact support.');
	}
	if (verified.reference !== ref) {
		error(400, 'This payment reference does not match an Owltside order.');
	}

	let fulfilment;
	try {
		fulfilment = await source.confirmPaidOrder(
			locals.session.userId,
			verified.reference,
			verified.amountKobo,
			verified.currency
		);
	} catch (cause) {
		console.error('Payment confirmation failed', {
			reference: verified.reference,
			message: cause instanceof Error ? cause.message : String(cause)
		});
		error(503, 'We could not finalise your order. Contact support with reference ' + verified.reference);
	}

	if (!fulfilment.ok) {
		if (fulfilment.reason === 'amount_mismatch') {
			error(
				402,
				'The amount charged did not match this order, so no tickets were issued. Contact support with reference ' +
					verified.reference
			);
		}
		if (fulfilment.reason === 'already_used') {
			error(409, 'This payment reference has already been used for another order.');
		}
		redirect(303, '/tickets');
	}

	const first = fulfilment.tickets[0];
	if (!first) redirect(303, '/tickets');

	redirect(303, `/tickets/${first.id}?new=1`);
};

import { json } from '@sveltejs/kit';
import { isValidPaystackSignature, paystackSecretConfigured } from '$lib/server/paystack';
import { confirmGatewayPayment } from '$lib/server/payments';
import type { RequestHandler } from './$types';

/**
 * Paystack webhook — the authoritative reconciliation point.
 *
 * A redirect can be lost (closed tab, flaky network) while the money is still
 * taken, and a redirect can be replayed. Only this endpoint, protected by the
 * HMAC signature over the raw body, is allowed to settle a payment on the
 * server. It is idempotent: repeat deliveries return 200 without re-minting.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!paystackSecretConfigured()) {
		// Nothing to verify against; refuse rather than accept unsigned events.
		return json({ error: 'Payment webhook is not configured.' }, { status: 503 });
	}

	// Signature is computed over the untouched body, so read text first.
	const rawBody = await request.text();
	const signature = request.headers.get('x-paystack-signature');

	if (!isValidPaystackSignature(rawBody, signature)) {
		return json({ error: 'Invalid signature.' }, { status: 401 });
	}

	let event: { event?: string; data?: Record<string, unknown> };
	try {
		event = JSON.parse(rawBody) as typeof event;
	} catch {
		return json({ error: 'Invalid payload.' }, { status: 400 });
	}

	if (event.event === 'charge.success' && event.data) {
		const reference = String(event.data.reference ?? '');
		const amountKobo = Number(event.data.amount ?? 0);
		const currency = String(event.data.currency ?? 'NGN').toUpperCase();

		if (reference) {
			try {
				const outcome = await confirmGatewayPayment({
					reference,
					amountKobo,
					currency,
					gatewayResponse: event.data
				});
				if (!outcome.ok) {
					// Amount mismatch or already-consumed reference: logged for
					// reconciliation and support, never minted.
					console.warn('Paystack webhook did not fulfil', {
						reference,
						reason: outcome.reason ?? 'unknown'
					});
				}
			} catch (cause) {
				// Return 200 anyway: Paystack retries storms are worse than a
				// logged failure, and the redirect flow can still settle it.
				console.error('Paystack webhook fulfilment failed', {
					reference,
					message: cause instanceof Error ? cause.message : String(cause)
				});
			}
		}
	}

	return json({ received: true });
};

import { createSupabaseAdmin } from './supabase';

/**
 * Server-only payment reconciliation.
 *
 * Runs with the service role because `confirm_payment` is deliberately not
 * granted to any client role: the only callers are this module (after the
 * webhook signature has been verified) and nothing else.
 */
export interface ConfirmationOutcome {
	ok: boolean;
	orderId: string;
	duplicate: boolean;
	reason?: string;
	ticketCount: number;
}

export async function confirmGatewayPayment(input: {
	reference: string;
	amountKobo: number;
	currency: string;
	gatewayResponse?: Record<string, unknown>;
}): Promise<ConfirmationOutcome> {
	const admin = createSupabaseAdmin();
	if (!admin) {
		throw new Error('Payment reconciliation is not configured (SUPABASE_SERVICE_ROLE_KEY missing).');
	}

	const { data, error } = await admin.rpc('confirm_payment', {
		p_reference: input.reference,
		p_amount_kobo: input.amountKobo,
		p_currency: input.currency,
		p_gateway_response: input.gatewayResponse ?? {}
	});

	if (error) throw new Error(error.message || 'Payment could not be confirmed');

	const row = (data ?? {}) as Record<string, unknown>;
	const tickets = Array.isArray(row.tickets) ? row.tickets : [];
	return {
		ok: row.ok === true,
		orderId: String(row.orderId ?? ''),
		duplicate: row.duplicate === true,
		reason: typeof row.reason === 'string' ? row.reason : undefined,
		ticketCount: tickets.length
	};
}

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The webhook is the only component allowed to settle money without a user
 * session, so its signature check, idempotency and failure handling are
 * security-critical contracts, not plumbing.
 */

const paystack = vi.hoisted(() => ({
	paystackSecretConfigured: vi.fn(() => true),
	isValidPaystackSignature: vi.fn(() => true),
	verifyTransactionDetails: vi.fn()
}));

const payments = vi.hoisted(() => ({ confirmGatewayPayment: vi.fn() }));

const source = vi.hoisted(() => ({
	mode: 'supabase',
	confirmPaidOrder: vi.fn()
}));

vi.mock('$lib/server/paystack', () => paystack);
vi.mock('$lib/server/payments', () => payments);
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null, supabaseConfigured: () => true }));
vi.mock('$lib/server/datasource', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/datasource')>();
	return { ...actual, getSource: () => source };
});

import { POST as webhook } from '../../src/routes/api/paystack/webhook/+server';
import { load as successLoad } from '../../src/routes/(app)/checkout/success/+page.server';

const charge = (reference = 'OWT-ABC', amount = 535_000) =>
	JSON.stringify({
		event: 'charge.success',
		data: { reference, amount, currency: 'NGN', status: 'success' }
	});

const call = (body: string, signature = 'sig') =>
	webhook({
		request: new Request('http://localhost/api/paystack/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-paystack-signature': signature },
			body
		})
	} as never);

beforeEach(() => {
	vi.clearAllMocks();
	paystack.paystackSecretConfigured.mockReturnValue(true);
	paystack.isValidPaystackSignature.mockReturnValue(true);
	payments.confirmGatewayPayment.mockResolvedValue({ ok: true, duplicate: false, ticketCount: 1 });
});

describe('Paystack webhook', () => {
	it('refuses to run when no secret is configured', async () => {
		paystack.paystackSecretConfigured.mockReturnValue(false);
		const response = await call(charge());
		expect(response.status).toBe(503);
		expect(payments.confirmGatewayPayment).not.toHaveBeenCalled();
	});

	it('rejects an unsigned or forged body', async () => {
		paystack.isValidPaystackSignature.mockReturnValue(false);
		const response = await call(charge(), 'forged');
		expect(response.status).toBe(401);
		expect(payments.confirmGatewayPayment).not.toHaveBeenCalled();
	});

	it('settles a signed charge with the amount the gateway reports', async () => {
		const body = charge('OWT-123', 1_070_000);
		const response = await call(body);

		expect(response.status).toBe(200);
		expect(paystack.isValidPaystackSignature).toHaveBeenCalledWith(body, 'sig');
		expect(payments.confirmGatewayPayment).toHaveBeenCalledWith(
			expect.objectContaining({ reference: 'OWT-123', amountKobo: 1_070_000, currency: 'NGN' })
		);
	});

	it('ignores events that are not successful charges', async () => {
		const response = await call(JSON.stringify({ event: 'transfer.success', data: {} }));
		expect(response.status).toBe(200);
		expect(payments.confirmGatewayPayment).not.toHaveBeenCalled();
	});

	it('accepts the delivery but logs when fulfilment fails, so Paystack does not storm', async () => {
		payments.confirmGatewayPayment.mockRejectedValue(new Error('database down'));
		const response = await call(charge());
		expect(response.status).toBe(200);
	});

	it('does not mint when the reconciliation reports a mismatch', async () => {
		payments.confirmGatewayPayment.mockResolvedValue({
			ok: false,
			reason: 'amount_mismatch',
			duplicate: false,
			ticketCount: 0
		});
		const response = await call(charge());
		expect(response.status).toBe(200);
		expect(payments.confirmGatewayPayment).toHaveBeenCalledTimes(1);
	});
});

describe('gateway return handler', () => {
	const load = (search: string, session: unknown = { userId: 'user-1' }) =>
		successLoad({
			url: new URL(`http://localhost/checkout/success${search}`),
			cookies: { getAll: () => [] },
			locals: { session, demoMode: false }
		} as never);

	beforeEach(() => {
		source.mode = 'supabase';
		paystack.verifyTransactionDetails.mockResolvedValue({
			reference: 'OWT-123',
			amountKobo: 1_070_000,
			currency: 'NGN',
			status: 'success'
		});
		source.confirmPaidOrder.mockResolvedValue({
			ok: true,
			tickets: [{ id: 'ticket-9' }]
		});
	});

	it('needs a reference from the gateway', async () => {
		await expect(load('')).rejects.toMatchObject({ status: 303, location: '/tickets' });
		expect(paystack.verifyTransactionDetails).not.toHaveBeenCalled();
	});

	it('asks Paystack what was paid and settles with that amount', async () => {
		await expect(
			load('?ref=OWT-123&slug=other-event&tier=tier-1&qty=6')
		).rejects.toMatchObject({ status: 303, location: '/tickets/ticket-9?new=1' });

		expect(paystack.verifyTransactionDetails).toHaveBeenCalledWith('OWT-123');
		// Nothing from the URL except the reference reaches fulfilment.
		expect(source.confirmPaidOrder).toHaveBeenCalledWith('user-1', 'OWT-123', 1_070_000, 'NGN');
	});

	it('refuses an unverifiable payment', async () => {
		paystack.verifyTransactionDetails.mockResolvedValue(null);
		await expect(load('?ref=OWT-123')).rejects.toMatchObject({ status: 400 });
		expect(source.confirmPaidOrder).not.toHaveBeenCalled();
	});

	it('surfaces an amount mismatch instead of minting', async () => {
		source.confirmPaidOrder.mockResolvedValue({ ok: false, reason: 'amount_mismatch', tickets: [] });
		await expect(load('?ref=OWT-123')).rejects.toMatchObject({ status: 402 });
	});

	it('does not fulfil anything for an already-consumed reference', async () => {
		source.confirmPaidOrder.mockResolvedValue({ ok: false, reason: 'already_used', tickets: [] });
		await expect(load('?ref=OWT-123')).rejects.toMatchObject({ status: 409 });
	});

	it('sends guests to sign in and resumes the same URL', async () => {
		await expect(load('?ref=OWT-123', null)).rejects.toMatchObject({
			status: 303,
			location: expect.stringContaining('/auth/login?next=')
		});
	});
});

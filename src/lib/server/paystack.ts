import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE = 'https://api.paystack.co';

export function resolvePaystackSecretKey(): string {
	return (privateEnv.PAYSTACK_SECRET_KEY || '').trim();
}

export function resolvePaystackPublicKey(): string {
	return (
		publicEnv.PUBLIC_PAYSTACK_PUBLIC_KEY ||
		publicEnv.PUBLIC_PAYSTACK_KEY ||
		privateEnv.PAYSTACK_PUBLIC_KEY ||
		privateEnv.VITE_PAYSTACK_PUBLIC_KEY ||
		''
	).trim();
}

export function paystackSecretConfigured(): boolean {
	return Boolean(resolvePaystackSecretKey());
}

export function paystackConfigured(): boolean {
	return Boolean(resolvePaystackSecretKey() || resolvePaystackPublicKey());
}

export interface PaystackInit {
	authorizationUrl: string;
	accessCode: string;
	reference: string;
}

/** A verified transaction, with the fields required to bind it to an order. */
export interface VerifiedTransaction {
	reference: string;
	status: string;
	amountKobo: number;
	currency: string;
	paidAt: string | null;
	channel: string | null;
	raw: Record<string, unknown>;
}

/** Create a transaction; the client is redirected to `authorization_url`. */
export async function initializeTransaction(opts: {
	email: string;
	amountKobo: number;
	reference: string;
	callbackUrl: string;
	metadata?: Record<string, unknown>;
}): Promise<PaystackInit> {
	const secret = resolvePaystackSecretKey();
	if (!secret) throw new Error('Paystack is not configured');
	if (!Number.isInteger(opts.amountKobo) || opts.amountKobo <= 0) {
		throw new Error('A payment amount of at least ₦1 is required');
	}

	const res = await fetch(`${BASE}/transaction/initialize`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${secret}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			email: opts.email,
			amount: opts.amountKobo,
			currency: 'NGN',
			reference: opts.reference,
			callback_url: opts.callbackUrl,
			...(opts.metadata ? { metadata: opts.metadata } : {})
		})
	});
	const json = await res.json();
	if (!json.status) throw new Error(json.message ?? 'Paystack initialization failed');
	return {
		authorizationUrl: json.data.authorization_url,
		accessCode: json.data.access_code,
		reference: json.data.reference
	};
}

/**
 * Server-side verification — the only source of truth for paid status.
 *
 * Returns the full transaction so callers can bind it to an order (amount,
 * currency, reference). Returns null when the key is missing so that a
 * deployment without Paystack can never be tricked into treating a payment as
 * verified: callers must treat null as "not paid".
 */
export async function verifyTransactionDetails(reference: string): Promise<VerifiedTransaction | null> {
	const secret = resolvePaystackSecretKey();
	if (!secret || !reference) return null;

	const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
		headers: { Authorization: `Bearer ${secret}` }
	});
	if (!res.ok) return null;

	const json = await res.json().catch(() => null);
	const data = json?.data as Record<string, unknown> | undefined;
	if (!json?.status || !data || data.status !== 'success') return null;

	return {
		reference: String(data.reference ?? reference),
		status: String(data.status),
		amountKobo: Number(data.amount ?? 0),
		currency: String(data.currency ?? 'NGN').toUpperCase(),
		paidAt: typeof data.paid_at === 'string' ? data.paid_at : null,
		channel: typeof data.channel === 'string' ? data.channel : null,
		raw: data
	};
}

/** Boolean convenience wrapper. Fails closed when Paystack is not configured. */
export async function verifyTransaction(reference: string): Promise<boolean> {
	return (await verifyTransactionDetails(reference)) !== null;
}

/**
 * Validate the `x-paystack-signature` header (HMAC-SHA512 of the raw body).
 * Must be called with the untouched request body string.
 */
export function isValidPaystackSignature(rawBody: string, signature: string | null): boolean {
	const secret = resolvePaystackSecretKey();
	if (!secret || !signature) return false;
	const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
	const actual = signature.trim().toLowerCase();
	if (expected.length !== actual.length) return false;
	try {
		return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
	} catch {
		return false;
	}
}

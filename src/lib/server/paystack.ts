import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

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

/** Create a transaction; the client is redirected to `authorization_url`. */
export async function initializeTransaction(opts: {
	email: string;
	amountKobo: number;
	reference: string;
	callbackUrl: string;
}): Promise<PaystackInit> {
	const secret = resolvePaystackSecretKey();
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
			callback_url: opts.callbackUrl
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

/** Server-side verification — the only source of truth for paid status. */
export async function verifyTransaction(reference: string): Promise<boolean> {
	const secret = resolvePaystackSecretKey();
	if (!secret) return true;
	const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
		headers: { Authorization: `Bearer ${secret}` }
	});
	const json = await res.json();
	return json.status === true && json.data?.status === 'success';
}

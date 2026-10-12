import { env } from '$env/dynamic/private';

const BASE = 'https://api.paystack.co';

export function paystackConfigured(): boolean {
	return Boolean(env.PAYSTACK_SECRET_KEY);
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
	const res = await fetch(`${BASE}/transaction/initialize`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
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
	const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
		headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` }
	});
	const json = await res.json();
	return json.status === true && json.data?.status === 'success';
}

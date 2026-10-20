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

/**
 * Paystack bank codes for the banks offered in the payout sheet.
 *
 * Only banks listed here can be resolved against the live register; anything
 * else deliberately falls back to the demo directory instead of guessing a
 * code, because a wrong code returns another customer's name.
 */
export const PAYSTACK_BANK_CODES: Record<string, string> = {
	GTBank: '058',
	'Access Bank': '044',
	'Zenith Bank': '057',
	'First Bank': '011',
	UBA: '033',
	Kuda: '50211',
	Moniepoint: '50515',
	OPay: '999992',
	PalmPay: '999991',
	'Fidelity Bank': '070',
	'Union Bank': '032',
	'Sterling Bank': '232'
};

export class PaystackResolveError extends Error {}

/**
 * Resolve the account holder's name from the live NIBSS register via Paystack.
 * Throws `PaystackResolveError` when the bank is unsupported, the account does
 * not exist or Paystack rejects the request — callers must not invent a name.
 */
export async function resolveBankAccountName(bank: string, accountNumber: string): Promise<string> {
	const secret = resolvePaystackSecretKey();
	if (!secret) throw new PaystackResolveError('No Paystack secret key configured.');
	const bankCode = PAYSTACK_BANK_CODES[bank];
	if (!bankCode) throw new PaystackResolveError(`No bank code for ${bank}.`);
	const url = `${BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
	const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
	let payload: { status?: boolean; message?: string; data?: { account_name?: string } } = {};
	try {
		payload = await response.json();
	} catch {
		/* non-JSON error page */
	}
	const name = payload.data?.account_name?.trim();
	if (!response.ok || !payload.status || !name) {
		throw new PaystackResolveError(payload.message ?? 'The bank could not confirm that account.');
	}
	return name;
}

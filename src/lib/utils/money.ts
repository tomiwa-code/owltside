import type { Currency } from '$lib/types';

/** Static demo FX rate: how many USD one Naira buys. Live rates would come from the server. */
export const NGN_TO_USD = 1 / 1550;

export function convert(amountNgn: number, currency: Currency): number {
	return currency === 'NGN' ? amountNgn : amountNgn * NGN_TO_USD;
}

export function formatMoney(amountNgn: number, currency: Currency = 'NGN'): string {
	if (currency === 'USD') {
		const usd = convert(amountNgn, 'USD');
		return `$${usd.toLocaleString('en-US', { maximumFractionDigits: usd < 100 ? 2 : 0 })}`;
	}
	return `₦${amountNgn.toLocaleString('en-NG')}`;
}

/** Paystack works in kobo (NGN) — smallest unit. */
export function toKobo(amountNgn: number): number {
	return Math.round(amountNgn * 100);
}

/** Platform service fee: 5% of the paid ticket value plus a flat ₦100 per ticket. */
export const SERVICE_FEE_PCT = 0.05;
export const SERVICE_FEE_FLAT_NGN = 100;

/**
 * Service fee charged to the buyer on top of the ticket price.
 * `qty` tickets cost `5% of (price × qty) + ₦100 × qty`.
 * Free tickets never carry a fee.
 */
export function addFee(amountNgn: number, qty = 1): number {
	if (amountNgn <= 0 || qty <= 0) return 0;
	return Math.round(amountNgn * SERVICE_FEE_PCT) + SERVICE_FEE_FLAT_NGN * qty;
}

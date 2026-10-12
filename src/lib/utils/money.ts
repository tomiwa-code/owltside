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

export function addFee(amountNgn: number): number {
	// 1.5% platform fee, capped at ₦1,000, waived on free tickets
	if (amountNgn <= 0) return 0;
	return Math.min(Math.round(amountNgn * 0.015), 1000);
}

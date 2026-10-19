import type { ResolvedPromo } from '$lib/types';
import { normalizePromoCode, promoDiscount } from '$lib/utils/promo';

export const PROMOS: Record<string, { kind: 'flat' | 'pct'; value: number }> = {
	TECHCOMMUNITY: { kind: 'flat', value: 5000 },
	OWL10: { kind: 'pct', value: 10 }
};

export function globalPromoForCode(code: string | null | undefined): ResolvedPromo | null {
	const normalized = normalizePromoCode(code);
	const promo = PROMOS[normalized];
	return promo ? { code: normalized, ...promo, source: 'global' } : null;
}

export function computeTotals(price: number, qty: number, promo: string | ResolvedPromo | null) {
	const base = price * qty;
	const fee = base > 0 ? Math.min(Math.round(base * 0.015), 1000) : 0;
	const resolved = typeof promo === 'string' ? globalPromoForCode(promo) : promo;
	const discount = promoDiscount(base, resolved);
	return { base, fee, discount, total: Math.max(0, base + fee - discount), promo: resolved };
}

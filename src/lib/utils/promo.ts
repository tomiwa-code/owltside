import type { EventPromo, ResolvedPromo } from '$lib/types';

/**
 * Promo codes are entered by both organizers and buyers, so normalize every
 * boundary the same way: case does not matter and a space typed in a phrase
 * such as "EARLY BIRD" means the stored `EARLY-BIRD` code.
 */
export function normalizePromoCode(value: string | null | undefined): string {
	return (value ?? '').trim().toUpperCase().replace(/\s+/g, '-');
}

export function isValidPromoCode(value: string): boolean {
	return /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(normalizePromoCode(value));
}

export function normalizeEventPromos(
	promos: Iterable<{ code: string; percent: number; maxUses: number; uses?: number }> | null | undefined
): EventPromo[] {
	const byCode = new Map<string, EventPromo>();
	for (const promo of promos ?? []) {
		const code = normalizePromoCode(promo.code);
		const percent = Number(promo.percent);
		const maxUses = Math.floor(Number(promo.maxUses));
		if (!isValidPromoCode(code) || !Number.isFinite(percent) || percent < 1 || percent > 100 || !Number.isFinite(maxUses) || maxUses < 1) {
			continue;
		}
		if (byCode.has(code)) continue;
		byCode.set(code, {
			code,
			percent,
			maxUses,
			...(promo.uses !== undefined ? { uses: Math.max(0, Math.floor(Number(promo.uses) || 0)) } : {})
		});
	}
	return [...byCode.values()];
}

export type EventPromoResolution =
	| { state: 'valid'; promo: ResolvedPromo; definition: EventPromo }
	| { state: 'exhausted'; definition: EventPromo }
	| { state: 'missing' };

export function resolveEventPromo(
	promos: Iterable<EventPromo> | null | undefined,
	code: string | null | undefined
): EventPromoResolution {
	const normalized = normalizePromoCode(code);
	if (!normalized) return { state: 'missing' };
	const definition = normalizeEventPromos(promos).find((promo) => promo.code === normalized);
	if (!definition) return { state: 'missing' };
	if ((definition.uses ?? 0) >= definition.maxUses) return { state: 'exhausted', definition };
	return {
		state: 'valid',
		definition,
		promo: { code: definition.code, kind: 'pct', value: definition.percent, source: 'event' }
	};
}

export function promoDiscount(subtotal: number, promo: ResolvedPromo | null | undefined): number {
	if (!promo || subtotal <= 0) return 0;
	if (promo.kind === 'flat') return Math.min(Math.max(0, promo.value), subtotal);
	return Math.min(subtotal, Math.max(0, Math.round((subtotal * promo.value) / 100)));
}

import { describe, expect, it } from 'vitest';
import {
	isValidPromoCode,
	normalizeEventPromos,
	normalizePromoCode,
	promoDiscount,
	resolveEventPromo
} from './promo';

describe('event promo helpers', () => {
	it('normalizes organizer and buyer spellings to the same code', () => {
		expect(normalizePromoCode(' early bird ')).toBe('EARLY-BIRD');
		expect(normalizePromoCode('Owl10')).toBe('OWL10');
		expect(isValidPromoCode('early bird')).toBe(true);
		expect(isValidPromoCode('x')).toBe(false);
		expect(isValidPromoCode('bad code!')).toBe(false);
	});

	it('deduplicates valid definitions and preserves redemption counts', () => {
		expect(
			normalizeEventPromos([
				{ code: 'launch 20', percent: 20, maxUses: 50, uses: 3.8 },
				{ code: 'LAUNCH-20', percent: 99, maxUses: 1 },
				{ code: 'NO', percent: 10, maxUses: 10 },
				{ code: 'ZERO', percent: 0, maxUses: 10 }
			])
		).toEqual([{ code: 'LAUNCH-20', percent: 20, maxUses: 50, uses: 3 }]);
	});

	it('resolves an unredeemed event code and reports exhaustion separately', () => {
		const promos = [{ code: 'EARLY-BIRD', percent: 15, maxUses: 2, uses: 1 }];
		expect(resolveEventPromo(promos, 'early bird')).toMatchObject({
			state: 'valid',
			promo: { code: 'EARLY-BIRD', kind: 'pct', value: 15, source: 'event' }
		});
		expect(resolveEventPromo([{ ...promos[0], uses: 2 }], 'EARLY-BIRD').state).toBe('exhausted');
		expect(resolveEventPromo(promos, 'OTHER').state).toBe('missing');
	});

	it('caps percentage and flat discounts at the subtotal', () => {
		expect(promoDiscount(10_000, { code: 'A', kind: 'pct', value: 20, source: 'event' })).toBe(2_000);
		expect(promoDiscount(3_000, { code: 'B', kind: 'flat', value: 5_000, source: 'global' })).toBe(3_000);
		expect(promoDiscount(10_000, null)).toBe(0);
	});
});

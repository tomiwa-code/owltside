import { describe, expect, it } from 'vitest';
import { computeTotals, globalPromoForCode } from './promos';

describe('checkout promo totals', () => {
	it('keeps the existing global codes working case-insensitively', () => {
		expect(globalPromoForCode('owl10')).toEqual({
			code: 'OWL10',
			kind: 'pct',
			value: 10,
			source: 'global'
		});
		expect(computeTotals(10_000, 2, 'OWL10')).toMatchObject({
			base: 20_000,
			discount: 2_000,
			total: 19_200 // 20,000 + (1,000 + 200) − 2,000
		});
	});

	it('charges 5% + ₦100 per paid ticket and nothing on free passes', () => {
		expect(computeTotals(10_000, 1, null)).toMatchObject({ base: 10_000, fee: 600, total: 10_600 });
		expect(computeTotals(10_000, 3, null)).toMatchObject({ base: 30_000, fee: 1_800, total: 31_800 });
		expect(computeTotals(0, 4, null)).toMatchObject({ base: 0, fee: 0, total: 0 });
	});

	it('applies a server-resolved event promo on top of the service fee', () => {
		expect(
			computeTotals(10_000, 2, {
				code: 'EARLY-BIRD',
				kind: 'pct',
				value: 20,
				source: 'event'
			})
		).toMatchObject({ base: 20_000, fee: 1_200, discount: 4_000, total: 17_200 });
	});
});

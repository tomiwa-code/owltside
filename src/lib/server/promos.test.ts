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
			total: 18_300
		});
	});

	it('applies a server-resolved event promo before the gateway fee', () => {
		expect(
			computeTotals(10_000, 2, {
				code: 'EARLY-BIRD',
				kind: 'pct',
				value: 20,
				source: 'event'
			})
		).toMatchObject({ base: 20_000, fee: 300, discount: 4_000, total: 16_300 });
	});
});

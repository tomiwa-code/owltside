import { describe, expect, it } from 'vitest';
import { calculateFeeQuote, DEFAULT_FEE_POLICY, DEFAULT_FEE_RULES } from './fees';
const quote = (price: number, feeBearer: 'PASS' | 'ABSORB' = 'PASS') => calculateFeeQuote({ ticketPriceKobo: price, feeBearer, rules: DEFAULT_FEE_RULES, policy: DEFAULT_FEE_POLICY });

describe('tiered fee engine (integer kobo)', () => {
	it('quotes a ₦1,000 PASS ticket', () => {
		const result = quote(100_000);
		expect(result.platformFeeKobo).toBe(14_000);
		expect(result.buyerTotalKobo).toBe(100_000 + 14_000 + 11_500);
		expect(result.organizerNetKobo).toBe(100_000);
	});
	it('quotes a ₦10,000 ABSORB ticket', () => {
		const result = quote(1_000_000, 'ABSORB');
		expect(result.platformFeeKobo).toBe(70_000);
		expect(result.organizerNetKobo).toBe(930_000);
		expect(result.buyerTotalKobo).toBe(1_000_000 + 25_000);
	});
	it('uses high tier and caps correctly', () => {
		expect(quote(5_000_000).platformFeeKobo).toBe(260_000);
		const high = quote(20_000_000);
		expect(high.platformFeeKobo).toBe(500_000);
		expect(high.appliedRuleName).toBe('high_price_default');
		expect(Math.round(20_000_000 * 500 / 10_000) + 10_000).toBe(1_010_000);
		expect(high.currency).toBe('NGN');
	});
	it('applies the separate processing cap', () => {
		expect(quote(20_000_000).processingFeeKobo).toBe(200_000);
	});
	it('does not charge a platform fee for free tickets', () => {
		const result = quote(0);
		expect(result.platformFeeKobo).toBe(0);
		expect(result.processingFeeKobo).toBe(0);
		expect(result.appliedRuleName).toBeNull();
	});
	it.each([
		[199_999, 'low_price_default'], [200_000, 'mid_range_default'],
		[1_500_000, 'mid_range_default'], [1_500_001, 'high_price_default']
	])('selects expected rule at %i kobo', (price, name) => {
		expect(quote(price).appliedRuleName).toBe(name);
	});
	it('distinguishes ABSORB and PASS', () => {
		const pass = quote(2_000_000, 'PASS');
		const absorb = quote(2_000_000, 'ABSORB');
		expect(pass.buyerTotalKobo - absorb.buyerTotalKobo).toBe(pass.platformFeeKobo);
		expect(pass.organizerNetKobo - absorb.organizerNetKobo).toBe(pass.platformFeeKobo);
	});
	it('rounds half-kobo percentages deterministically upward', () => {
		const result = calculateFeeQuote({
			ticketPriceKobo: 1, feeBearer: 'PASS',
			rules: [{ ...DEFAULT_FEE_RULES[0], minPriceKobo: 1, maxPriceKobo: null, percentageBps: 5_000, fixedFeeKobo: 0, capKobo: null }],
			policy: { ...DEFAULT_FEE_POLICY, processingBps: 0, processingFixedKobo: 0 }
		});
		expect(result.platformFeeKobo).toBe(1);
	});
	it('supports a separately absorbed processing fee', () => {
		const policy = { ...DEFAULT_FEE_POLICY, processingFeeBearer: 'ABSORB' as const };
		const result = calculateFeeQuote({ ticketPriceKobo: 1_000_000, feeBearer: 'PASS', rules: DEFAULT_FEE_RULES, policy });
		expect(result.buyerTotalKobo).toBe(1_000_000 + 70_000);
		expect(result.organizerNetKobo).toBe(1_000_000 - 25_000);
	});
	it('rejects negative and fractional kobo amounts', () => {
		expect(() => quote(-1)).toThrow();
		expect(() => quote(1.2)).toThrow();
	});
});

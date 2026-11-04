import { describe, expect, it } from 'vitest';
import { addFee, convert, formatMoney, toKobo } from './money';

describe('money', () => {
	it('formats NGN with naira sign and thousands separators', () => {
		expect(formatMoney(45_000)).toBe('₦45,000');
	});

	it('converts and formats USD', () => {
		expect(formatMoney(15_500, 'USD')).toBe('$10');
		expect(convert(15_500, 'USD')).toBeCloseTo(10, 5);
	});

	it('converts to kobo for Paystack', () => {
		expect(toKobo(61.5)).toBe(6150);
	});

	it('charges 5% plus ₦100 per paid ticket', () => {
		expect(addFee(10_000)).toBe(600); // 500 + 100
		expect(addFee(20_000, 2)).toBe(1200); // 5% of 20k + 2 × 100
		expect(addFee(5_000, 3)).toBe(550); // 250 + 300
		expect(addFee(45_000, 1)).toBe(2350); // 2250 + 100
	});

	it('never charges a fee on free tickets', () => {
		expect(addFee(0)).toBe(0);
		expect(addFee(0, 4)).toBe(0);
		expect(addFee(-100)).toBe(0);
	});
});

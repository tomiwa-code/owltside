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

	it('caps the platform fee at ₦1,000 and waives it for free tickets', () => {
		expect(addFee(0)).toBe(0);
		expect(addFee(10_000)).toBe(150);
		expect(addFee(1_000_000)).toBe(1000);
	});
});

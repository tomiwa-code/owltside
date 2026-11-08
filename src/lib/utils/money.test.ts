import { describe, expect, it } from 'vitest';
import { convert, formatMoney, toKobo } from './money';

describe('money formatting helpers', () => {
	it('formats NGN with naira sign and thousands separators', () => expect(formatMoney(45_000)).toBe('₦45,000'));
	it('converts and formats USD', () => {
		expect(formatMoney(15_500, 'USD')).toBe('$10');
		expect(convert(15_500, 'USD')).toBeCloseTo(10, 5);
	});
	it('converts to kobo for Paystack', () => expect(toKobo(61.5)).toBe(6150));
});

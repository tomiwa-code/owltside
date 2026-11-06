// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { QR_WINDOW_SECONDS, parseTicketToken, signTicketToken } from '$lib/server/qr-sign';

/**
 * The rotating QR is a bearer credential: a forged one is a free entry. These
 * cover the three properties the scanner depends on — a good token verifies,
 * a tampered token never downgrades to a usable code, and a stale window is
 * rejected after one grace period.
 */

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

describe('signed ticket tokens', () => {
	it('round-trips a freshly signed code', () => {
		const token = signTicketToken('EV-1A2B-3C4D-5E6F', NOW);
		expect(token.startsWith('owltside://t/')).toBe(true);

		const parsed = parseTicketToken(token, NOW);
		expect(parsed).toEqual({ code: 'EV-1A2B-3C4D-5E6F', signed: true, valid: true });
	});

	it('accepts one window of scanner clock skew', () => {
		const token = signTicketToken('EV-1A2B-3C4D-5E6F', NOW);
		const skewed = parseTicketToken(token, NOW + QR_WINDOW_SECONDS * 1000);
		expect(skewed.valid).toBe(true);
	});

	it('rejects a token from an expired window', () => {
		const token = signTicketToken('EV-1A2B-3C4D-5E6F', NOW);
		const stale = parseTicketToken(token, NOW + QR_WINDOW_SECONDS * 5 * 1000);
		expect(stale).toMatchObject({ signed: true, valid: false });
	});

	it('rejects a code swapped under a valid signature', () => {
		const token = signTicketToken('EV-AAAA-BBBB-CCCC', NOW);
		const forged = token.replace('EV-AAAA-BBBB-CCCC', 'EV-1111-2222-3333');
		expect(parseTicketToken(forged, NOW)).toMatchObject({ signed: true, valid: false });
	});

	it('rejects a signature stripped or rewritten', () => {
		const token = signTicketToken('EV-AAAA-BBBB-CCCC', NOW);
		expect(parseTicketToken(token.replace(/\?s=.*$/, ''), NOW).valid).toBe(false);
		expect(parseTicketToken(token.replace(/\?s=[0-9a-f]{16}$/, '?s=0000000000000000'), NOW).valid).toBe(
			false
		);
	});

	it('still accepts a typed-in bare code', () => {
		expect(parseTicketToken('EV-1A2B-3C4D-5E6F', NOW)).toEqual({
			code: 'EV-1A2B-3C4D-5E6F',
			signed: false,
			valid: true
		});
	});
});

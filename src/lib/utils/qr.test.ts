import { describe, expect, it } from 'vitest';
import { newTicketCode, signToken } from './qr';

describe('qr tokens', () => {
	it('signs a rotating payload with the expected shape', async () => {
		const now = new Date('2026-10-12T12:00:00Z').getTime();
		const a = await signToken('EV-7QK2-4M8P-9XRT', 'secret', 30, now);
		const b = await signToken('EV-7QK2-4M8P-9XRT', 'secret', 30, now + 30_000);
		expect(a).toMatch(/^owltside:\/\/t\/EV-7QK2-4M8P-9XRT\?s=[0-9a-f]{16}$/);
		// signature rotates with the window → screenshots expire
		expect(a).not.toBe(b);
	});

	it('same window, same signature (verifier can recompute)', async () => {
		const now = new Date('2026-10-12T12:00:10Z').getTime();
		const a = await signToken('EV-AAAA-BBBB-CCCC', 'secret', 30, now);
		const b = await signToken('EV-AAAA-BBBB-CCCC', 'secret', 30, now + 5_000);
		expect(a).toBe(b);
	});

	it('generates well-formed ticket codes', () => {
		let seed = 42;
		const rand = () => {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280;
		};
		const code = newTicketCode(rand);
		expect(code).toMatch(/^EV-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
	});
});

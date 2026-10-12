import { describe, expect, it } from 'vitest';
import { countdown, countdownLabel, fmtRelative, secondsLeftInWindow, tokenWindow } from './dates';

const NOW = new Date('2026-10-12T12:00:00Z').getTime();

describe('dates', () => {
	it('computes countdown parts', () => {
		const c = countdown(new Date(NOW + 90_000).toISOString(), NOW);
		expect(c.minutes).toBe(1);
		expect(c.seconds).toBe(30);
		expect(c.past).toBe(false);
	});

	it('labels upcoming events', () => {
		expect(countdownLabel(new Date(NOW + 3 * 86_400_000 + 2 * 3_600_000).toISOString(), NOW)).toBe('In 3d 2h');
		expect(countdownLabel(new Date(NOW - 1000).toISOString(), NOW)).toBe('Started');
	});

	it('relative time', () => {
		expect(fmtRelative(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5m ago');
	});

	it('30s HMAC windows rotate', () => {
		expect(tokenWindow(0)).toBe(0);
		expect(tokenWindow(29_999)).toBe(0);
		expect(tokenWindow(30_000)).toBe(1);
		expect(secondsLeftInWindow(29_000)).toBe(1);
	});
});

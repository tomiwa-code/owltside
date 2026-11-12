import { describe, expect, it } from 'vitest';
import { GC_TIME, STALE_TIME } from '$lib/query/client';
import {
	approvalsQueryOptions,
	badgesQueryOptions,
	conversationsQueryOptions,
	eventsQueryOptions,
	notificationsQueryOptions,
	organizerQueryOptions,
	ticketsQueryOptions
} from '$lib/query/options';

/**
 * The cache is the navigation path (see `+page.ts` loads), so an over-eager
 * freshness window is a UX bug: it refetches in the background while the
 * visitor is reading, and it drops the warm entry the next route load would
 * have used. These assertions pin the policy, not the exact numbers.
 */
describe('cache freshness policy', () => {
	it('keeps every cached resource fresh for at least a minute', () => {
		for (const [name, staleTime] of Object.entries(STALE_TIME)) {
			expect(staleTime, name).toBeGreaterThanOrEqual(60_000);
		}
	});

	it('gives the public catalogue the longest window and the organizer ledger the shortest', () => {
		const windows = Object.values(STALE_TIME);
		expect(STALE_TIME.catalogue).toBe(Math.max(...windows));
		expect(STALE_TIME.organizer).toBe(Math.min(...windows));
		expect(STALE_TIME.catalogue).toBeGreaterThanOrEqual(30 * 60_000);
	});

	it('holds unused entries for well past a typical session detour', () => {
		expect(GC_TIME).toBeGreaterThanOrEqual(30 * 60_000);
		expect(GC_TIME).toBeGreaterThan(STALE_TIME.catalogue);
	});

	it('polls the fallback cadence slowly, minutes rather than seconds', () => {
		// No socket exists in this environment, so these options carry the poll
		// interval a demo-mode browser would actually use.
		for (const options of [
			conversationsQueryOptions(),
			badgesQueryOptions(),
			notificationsQueryOptions(),
			approvalsQueryOptions(),
			organizerQueryOptions(),
			eventsQueryOptions(),
			ticketsQueryOptions()
		]) {
			const interval = options.refetchInterval;
			if (typeof interval === 'number') expect(interval).toBeGreaterThanOrEqual(3 * 60_000);
		}
		expect(conversationsQueryOptions().refetchInterval).toBe(3 * 60_000);
		expect(notificationsQueryOptions().refetchInterval).toBe(5 * 60_000);
		expect(ticketsQueryOptions().staleTime).toBe(STALE_TIME.tickets);
	});
});

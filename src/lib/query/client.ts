import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

/**
 * App-wide TanStack Query configuration.
 *
 * The server has no long-lived cache: `getQueryClient()` returns a fresh client
 * for every SSR render so one request's rows can never leak into another. In the
 * browser a single client owns every query, which is what dedupes concurrent
 * fetches, lets two components share one cache entry, and keeps data warm across
 * navigations.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/**
 * Default freshness windows, in one place so screens stay consistent.
 *
 * These are deliberately generous: every one of these resources is also pushed
 * over Realtime, and every mutation marks the cache dirty (see
 * `$lib/query/mutation`), so a longer window costs correctness nothing — it only
 * removes the background refetch that used to fire while a visitor was reading.
 */
export const STALE_TIME = {
	/** Public event catalogue: changes only when an organizer publishes. */
	catalogue: 30 * MINUTE,
	/** Badge counters + notification stream: pushed over Realtime. */
	live: 5 * MINUTE,
	/** Inbox lists + threads: pushed over Realtime. */
	inbox: 5 * MINUTE,
	/** Organizer ledger: sales are not published to Realtime (see options.ts). */
	organizer: 2 * MINUTE,
	/** Wallets, approvals, profiles. */
	account: 10 * MINUTE,
	/** The ticket vault: passes only change on transfer, refund or check-in. */
	tickets: 5 * MINUTE
} as const;

/**
 * How long an unused entry stays in memory (and on disk, for the catalogue).
 * Deliberately longer than the longest staleTime: an entry that is evicted at
 * the moment it goes stale would turn a revisit into a cold fetch.
 */
export const GC_TIME = 60 * MINUTE;

export function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 2 * MINUTE,
				gcTime: GC_TIME,
				// One retry is enough for a flaky mobile network; TanStack's
				// exponential backoff stops a broken endpoint from hammering.
				retry: 1,
				retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
				refetchOnWindowFocus: true,
				refetchOnReconnect: true,
				refetchOnMount: true,
				networkMode: 'online',
				structuralSharing: true
			},
			mutations: {
				// Mutating endpoints are not idempotent; never replay one blindly.
				retry: 0,
				networkMode: 'online'
			}
		}
	});
}

let browserClient: QueryClient | undefined;

/** The browser's singleton client; a fresh client per call on the server. */
export function getQueryClient(): QueryClient {
	if (!browser) return makeQueryClient();
	browserClient ??= makeQueryClient();
	return browserClient;
}

/** Test helper: drop the browser singleton so each case starts cold. */
export function resetQueryClientForTests(): void {
	browserClient?.clear();
	browserClient = undefined;
}

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

/** Default freshness windows, in one place so screens stay consistent. */
export const STALE_TIME = {
	/** Public event catalogue: changes only when an organizer publishes. */
	catalogue: 5 * MINUTE,
	/** Badge counters + notification stream: pushed over Realtime. */
	live: 60 * SECOND,
	/** Inbox lists + threads: pushed over Realtime. */
	inbox: 60 * SECOND,
	/** Organizer ledger: sales are not published to Realtime (see options.ts). */
	organizer: 45 * SECOND,
	/** Wallets, approvals, profiles. */
	account: 60 * SECOND
} as const;

export const GC_TIME = 10 * MINUTE;

export function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30 * SECOND,
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

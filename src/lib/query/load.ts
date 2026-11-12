import { browser } from '$app/environment';
import type { QueryKey } from '@tanstack/svelte-query';
import { getQueryClient } from './client';

/**
 * Cache-aware route data.
 *
 * SvelteKit re-runs the leaf load on every navigation. A `+page.server.ts` load
 * therefore re-queries the database and ships the payload again even when the
 * browser already holds it — TanStack never gets a say. A universal load can
 * read the same cache the components read, so a tab switch that lands on fresh
 * data performs **no request at all**; only a stale or cold entry is fetched.
 *
 * On the server (first render) there is no browser cache, so the loader falls
 * through to `fetch`, which SvelteKit resolves in-process and with cookies.
 */

function cache() {
	return getQueryClient();
}

/** The cached value, but only while it is still inside `staleTime`. */
export function cachedValue<T>(key: QueryKey, staleTime: number): T | undefined {
	if (!browser) return undefined;
	const state = cache().getQueryState<T>(key);
	if (!state || state.data === undefined || state.dataUpdatedAt <= 0) return undefined;
	if (state.isInvalidated) return undefined;
	if (Date.now() - state.dataUpdatedAt > staleTime) return undefined;
	return state.data;
}

/** Write a load result into the shared cache so mounting queries stay quiet. */
export function primeCache<T>(key: QueryKey, data: T): T {
	if (browser) cache().setQueryData(key, data);
	return data;
}

export interface CachedRequest<T> {
	key: QueryKey;
	staleTime: number;
	request: () => Promise<T>;
}

/** Cache-first request used by universal loads. */
export async function cachedRequest<T>({ key, staleTime, request }: CachedRequest<T>): Promise<T> {
	const cached = cachedValue<T>(key, staleTime);
	if (cached !== undefined) return cached;
	return primeCache(key, await request());
}

export interface CachedJsonRequest {
	key: QueryKey;
	url: string;
	staleTime: number;
}

/** Cache-first GET of a same-origin JSON endpoint. */
export async function cachedJson<T>(
	fetchFn: typeof fetch,
	{ key, url, staleTime }: CachedJsonRequest
): Promise<T> {
	return cachedRequest<T>({
		key,
		staleTime,
		request: async () => {
			const response = await fetchFn(url);
			if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
			return (await response.json()) as T;
		}
	});
}

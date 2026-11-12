import type { QueryClient } from '@tanstack/svelte-query';
import { getQueryClient } from './client';
import { keyMatchesPrefix, toQueryKey } from './keys';
import { clearPersisted } from './persist';
import { resetDataChangeClock } from './mutation';

/**
 * Imperative access to the cache, used by event handlers (mark-as-read,
 * optimistic writes, invalidations after a mutation) and by unit tests.
 *
 * Reads live in components through `createQuery`; this facade is only for code
 * that is not itself a query observer. It delegates to the same TanStack client
 * the provider hands to the component tree, so a write here is visible to every
 * mounted query immediately. Keys may be passed as the readable `domain:scope`
 * string or in TanStack's array form.
 */

type KeyInput = string | readonly unknown[];

function client(): QueryClient {
	return getQueryClient();
}

export interface CachedEntry<T> {
	data: T;
	updatedAt: number;
}

export const queryClient = {
	get client(): QueryClient {
		return client();
	},

	/** Cached data + when it was written, or `undefined` when absent. */
	get<T>(key: KeyInput): CachedEntry<T> | undefined {
		const normalized = toQueryKey(key);
		const state = client().getQueryState<T>(normalized);
		const data = client().getQueryData<T>(normalized);
		if (data === undefined || !state || state.dataUpdatedAt <= 0) return undefined;
		return { data, updatedAt: state.dataUpdatedAt };
	},

	/** Write data as if a fetch had just succeeded. */
	set<T>(key: KeyInput, data: T): void {
		client().setQueryData<T>(toQueryKey(key), data);
	},

	/**
	 * Mark every cached key under `prefix` stale. Active observers refetch in
	 * the background; inactive entries are dropped so a later mount starts from
	 * the network instead of resurrecting a value nobody is watching.
	 */
	invalidate(prefix: string): void {
		const predicate = (query: { queryKey: unknown }) => keyMatchesPrefix(query.queryKey, prefix);
		void client().invalidateQueries({ predicate, refetchType: 'active' });
		client().removeQueries({ predicate, type: 'inactive' });
	},

	/** Fetch, deduping with any in-flight request for the same key. */
	fetch<T>(key: KeyInput, fetcher: () => Promise<T>): Promise<T> {
		return client().fetchQuery({ queryKey: toQueryKey(key), queryFn: fetcher, staleTime: 0 });
	},

	/** Return fresh cached data, or fetch it (deduped) when stale. */
	ensure<T>(key: KeyInput, fetcher: () => Promise<T>, staleTime = 30_000): Promise<T> {
		return client().fetchQuery({ queryKey: toQueryKey(key), queryFn: fetcher, staleTime });
	},

	isFresh(key: KeyInput, staleTime: number): boolean {
		const state = client().getQueryState(toQueryKey(key));
		return !!state && state.dataUpdatedAt > 0 && Date.now() - state.dataUpdatedAt <= staleTime;
	},

	/** Age of the cached entry in ms, or `Infinity` when nothing is cached. */
	age(key: KeyInput): number {
		const state = client().getQueryState(toQueryKey(key));
		return state && state.dataUpdatedAt > 0 ? Date.now() - state.dataUpdatedAt : Infinity;
	},

	/** Forget everything, including persisted copies (tests and sign-out). */
	clearAll(): void {
		client().clear();
		clearPersisted();
		resetDataChangeClock();
	}
};

/** Convenience for the cache families in `keys.ts`. */
export function invalidatePrefix(prefix: string): void {
	queryClient.invalidate(prefix);
}

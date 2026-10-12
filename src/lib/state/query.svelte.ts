/**
 * A tiny TanStack-Query-flavoured cache for Svelte 5.
 *
 * - stale-while-revalidate: cached data renders instantly, a background
 *   refetch runs when the entry is older than `staleTime`.
 * - `refetchInterval` for polling (notifications, chat presence, …).
 * - `invalidate(prefix)` marks matching keys stale and refetches active queries.
 * - concurrent fetches for the same key are deduped.
 *
 * Effects are written to converge (guarded by isFetching / staleness checks)
 * so they can never re-trigger themselves into an infinite loop.
 */

type QueryEvent = 'set' | 'invalidate';

interface CacheEntry {
	data: unknown;
	updatedAt: number;
}

class QueryClient {
	#cache = new Map<string, CacheEntry>();
	#listeners = new Map<string, Set<(ev: QueryEvent) => void>>();
	#inflight = new Map<string, Promise<unknown>>();

	get<T>(key: string): CacheEntry & { data: T } | undefined {
		return this.#cache.get(key) as (CacheEntry & { data: T }) | undefined;
	}

	set<T>(key: string, data: T): void {
		this.#cache.set(key, { data, updatedAt: Date.now() });
		this.#notify(key, 'set');
	}

	#notify(key: string, ev: QueryEvent): void {
		this.#listeners.get(key)?.forEach((fn) => fn(ev));
	}

	subscribe(key: string, fn: (ev: QueryEvent) => void): () => void {
		let set = this.#listeners.get(key);
		if (!set) {
			set = new Set();
			this.#listeners.set(key, set);
		}
		set.add(fn);
		return () => {
			set.delete(fn);
			if (set.size === 0) this.#listeners.delete(key);
		};
	}

	/** Mark every key starting with `prefix` stale; active queries refetch. */
	invalidate(prefix: string): void {
		for (const key of [...this.#cache.keys()]) {
			if (key.startsWith(prefix)) this.#cache.delete(key);
		}
		for (const key of [...this.#listeners.keys()]) {
			if (key.startsWith(prefix)) this.#notify(key, 'invalidate');
		}
	}

	async fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
		const existing = this.#inflight.get(key);
		if (existing) return existing as Promise<T>;
		const promise = fetcher().finally(() => this.#inflight.delete(key));
		this.#inflight.set(key, promise);
		const data = await promise;
		this.set(key, data);
		return data;
	}
}

export const queryClient = new QueryClient();

export interface UseQueryOptions {
	/** How long (ms) cached data is considered fresh. Default 30 s. */
	staleTime?: number;
	/** Poll cadence (ms). Omit to disable polling. */
	refetchInterval?: number;
	enabled?: boolean;
}

export interface QueryResult<T> {
	readonly data: T | undefined;
	readonly status: 'pending' | 'success' | 'error';
	readonly error: unknown;
	readonly isFetching: boolean;
	readonly isStale: boolean;
	refetch: () => Promise<void>;
}

export function useQuery<T>(
	key: string,
	fetcher: () => Promise<T>,
	opts: UseQueryOptions = {},
	initial?: T
): QueryResult<T> {
	const staleTime = opts.staleTime ?? 30_000;

	let data = $state<T | undefined>(initial !== undefined ? initial : queryClient.get<T>(key)?.data);
	let status = $state<'pending' | 'success' | 'error'>(data !== undefined ? 'success' : 'pending');
	let error = $state<unknown>(undefined);
	let isFetching = $state(false);
	let updatedAt = $state(queryClient.get(key)?.updatedAt ?? (initial !== undefined ? Date.now() : 0));

	let fetchSeq = 0;

	const refetch = async () => {
		if (isFetching) return;
		isFetching = true;
		const seq = ++fetchSeq;
		try {
			const fresh = await queryClient.fetch(key, fetcher);
			if (seq === fetchSeq) {
				data = fresh;
				status = 'success';
				error = undefined;
				updatedAt = queryClient.get(key)?.updatedAt ?? Date.now();
			}
		} catch (e) {
			if (seq === fetchSeq) {
				error = e;
				if (data === undefined) status = 'error';
			}
		} finally {
			if (seq === fetchSeq) isFetching = false;
		}
	};

	// Cross-component sync + invalidation triggers.
	$effect(() => {
		return queryClient.subscribe(key, (ev) => {
			if (ev === 'set') {
				const entry = queryClient.get<T>(key);
				if (entry) {
					data = entry.data;
					updatedAt = entry.updatedAt;
					status = 'success';
					error = undefined;
				}
			} else {
				// invalidated → active queries refetch (TanStack behaviour)
				void refetch();
			}
		});
	});

	// Initial fetch when stale + optional polling. Converges: once data is
	// fresh, the staleness check is false and nothing re-triggers.
	$effect(() => {
		if (opts.enabled !== false) {
			const stale = Date.now() - updatedAt > staleTime;
			if (stale && !isFetching) void refetch();
		}
		let iv: ReturnType<typeof setInterval> | undefined;
		if (opts.refetchInterval && opts.enabled !== false) {
			iv = setInterval(() => void refetch(), opts.refetchInterval);
		}
		return () => {
			if (iv !== undefined) clearInterval(iv);
		};
	});

	return {
		get data() {
			return data;
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		get isFetching() {
			return isFetching;
		},
		get isStale() {
			return Date.now() - updatedAt > staleTime;
		},
		refetch
	};
}

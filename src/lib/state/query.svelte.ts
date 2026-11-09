/**
 * A tiny TanStack-Query-flavoured cache for Svelte 5.
 *
 * - stale-while-revalidate: cached data renders instantly, a background
 *   refetch runs when the entry is older than `staleTime`.
 * - `refetchInterval` for polling (notifications, chat presence, …).
 *   Polling is *egress aware*: it pauses while the tab is hidden, it never
 *   fires when the entry is still fresh, and it can be disabled entirely when
 *   a Realtime subscription already pushes updates.
 * - `persist: true` mirrors a key into `localStorage` so a cold start (or a
 *   reload of the event catalogue) renders from disk instead of re-downloading
 *   the same rows.
 * - `invalidate(prefix)` marks matching keys stale and refetches active queries.
 * - concurrent fetches for the same key are deduped.
 *
 * Effects are written to converge (guarded by isFetching / staleness checks)
 * so they can never re-trigger themselves into an infinite loop.
 */

import { browser } from '$app/environment';

type QueryEvent = 'set' | 'invalidate';

interface CacheEntry {
	data: unknown;
	updatedAt: number;
}

export interface PersistOptions {
	/** How long (ms) a persisted entry stays valid across reloads. Default 24 h. */
	maxAge?: number;
}

const STORAGE_PREFIX = 'owltside.query.';
const DEFAULT_PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

function storage(): Storage | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		return localStorage;
	} catch {
		// Private mode / storage disabled — the in-memory cache still works.
		return null;
	}
}

function readPersisted(key: string, maxAge: number): CacheEntry | undefined {
	const store = storage();
	if (!store) return undefined;
	try {
		const raw = store.getItem(STORAGE_PREFIX + key);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as CacheEntry;
		if (!parsed || typeof parsed.updatedAt !== 'number') return undefined;
		if (Date.now() - parsed.updatedAt > maxAge) {
			store.removeItem(STORAGE_PREFIX + key);
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

function writePersisted(key: string, entry: CacheEntry): void {
	const store = storage();
	if (!store) return;
	try {
		store.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
	} catch {
		// Quota exceeded (large payloads): drop the persisted copy rather than
		// letting a storage error break the in-memory cache.
		try {
			store.removeItem(STORAGE_PREFIX + key);
		} catch {
			/* ignore */
		}
	}
}

class QueryClient {
	#cache = new Map<string, CacheEntry>();
	#listeners = new Map<string, Set<(ev: QueryEvent) => void>>();
	#inflight = new Map<string, Promise<unknown>>();
	#persisted = new Map<string, number>();
	/** Entries not read/written for this long are dropped from memory. */
	#gcTime = 30 * 60 * 1000;

	get<T>(key: string): (CacheEntry & { data: T }) | undefined {
		// The cache is deliberately browser-only: a module-level cache on the
		// server would leak one request's rows into another user's render.
		if (!browser) return undefined;
		const entry = this.#cache.get(key) as (CacheEntry & { data: T }) | undefined;
		if (entry) return entry;
		const maxAge = this.#persisted.get(key);
		if (maxAge === undefined) return undefined;
		const restored = readPersisted(key, maxAge);
		if (!restored) return undefined;
		this.#cache.set(key, restored);
		return restored as CacheEntry & { data: T };
	}

	set<T>(key: string, data: T): void {
		if (!browser) return;
		const entry = { data, updatedAt: Date.now() };
		this.#cache.set(key, entry);
		if (this.#persisted.has(key)) writePersisted(key, entry);
		this.#sweep();
		this.#notify(key, 'set');
	}

	/** Opt a key into `localStorage` mirroring (call before the first fetch). */
	persist(key: string, options: PersistOptions = {}): void {
		if (!browser) return;
		this.#persisted.set(key, options.maxAge ?? DEFAULT_PERSIST_MAX_AGE);
	}

	/** True when a cached entry is younger than `staleTime`. */
	isFresh(key: string, staleTime: number): boolean {
		const entry = this.#cache.get(key);
		return !!entry && Date.now() - entry.updatedAt <= staleTime;
	}

	/** Age of a cached entry in ms, or `Infinity` when nothing is cached. */
	age(key: string): number {
		const entry = this.#cache.get(key);
		return entry ? Date.now() - entry.updatedAt : Infinity;
	}

	#notify(key: string, ev: QueryEvent): void {
		this.#listeners.get(key)?.forEach((fn) => fn(ev));
	}

	subscribe(key: string, fn: (ev: QueryEvent) => void): () => void {
		if (!browser) return () => {};
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

	/**
	 * Return the cached value when it is still fresh, otherwise fetch it.
	 * Concurrent callers share one request, and a fresh cache entry means the
	 * network is never touched — this is what keeps page transitions and
	 * multiple components mounting the same query from re-downloading rows.
	 */
	async ensure<T>(key: string, fetcher: () => Promise<T>, staleTime = 30_000): Promise<T> {
		if (this.isFresh(key, staleTime)) {
			return this.get<T>(key)!.data;
		}
		return this.fetch(key, fetcher);
	}

	/** Drop entries nobody has touched recently, so long sessions stay bounded. */
	#sweep(): void {
		if (this.#cache.size < 200) return;
		const cutoff = Date.now() - this.#gcTime;
		for (const [key, entry] of this.#cache) {
			if (entry.updatedAt < cutoff && !this.#listeners.has(key)) this.#cache.delete(key);
		}
	}

	/** Test helper: forget everything, including persisted copies. */
	clearAll(): void {
		this.#cache.clear();
		this.#inflight.clear();
		const store = storage();
		if (store) {
			for (const key of this.#persisted.keys()) {
				try {
					store.removeItem(STORAGE_PREFIX + key);
				} catch {
					/* ignore */
				}
			}
		}
	}
}

export const queryClient = new QueryClient();

export interface UseQueryOptions {
	/** How long (ms) cached data is considered fresh. Default 30 s. */
	staleTime?: number;
	/**
	 * Poll cadence (ms). Omit to disable polling. Ticks are skipped while the
	 * document is hidden and while the cached entry is still fresh.
	 */
	refetchInterval?: number;
	/**
	 * Keep polling while the tab is in the background. Off by default: a hidden
	 * tab that keeps polling is pure egress.
	 */
	refetchIntervalInBackground?: boolean;
	/** Refetch once when the tab becomes visible again (default true). */
	refetchOnWindowFocus?: boolean;
	/**
	 * Mirror this key into `localStorage` so a cold start renders from disk
	 * instead of re-downloading the same rows.
	 */
	persist?: boolean | PersistOptions;
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

const documentVisible = () =>
	typeof document === 'undefined' || document.visibilityState !== 'hidden';

export function useQuery<T>(
	key: string,
	fetcher: () => Promise<T>,
	opts: UseQueryOptions = {},
	initial?: T
): QueryResult<T> {
	const staleTime = opts.staleTime ?? 30_000;

	if (opts.persist) {
		queryClient.persist(key, typeof opts.persist === 'object' ? opts.persist : {});
	}

	if (initial !== undefined && queryClient.get(key) === undefined) {
		// Seed the cache from the server-rendered payload so the first client
		// render does not immediately refetch the same data.
		// `set` stamps `now`, so the seeded payload counts as fresh for one
		// `staleTime` window instead of triggering an immediate refetch.
		queryClient.set(key, initial);
	}

	let data = $state<T | undefined>(initial !== undefined ? initial : queryClient.get<T>(key)?.data);
	let status = $state<'pending' | 'success' | 'error'>(data !== undefined ? 'success' : 'pending');
	let error = $state<unknown>(undefined);
	let isFetching = $state(false);
	/** Exponential backoff after a failure, so a broken endpoint cannot loop. */
	let failures = 0;
	let retryAt = 0;
	const backoffMs = () => (failures === 0 ? 0 : Math.min(15_000 * 2 ** (failures - 1), 300_000));
	let updatedAt = $state(queryClient.get(key)?.updatedAt ?? (initial !== undefined ? Date.now() : 0));
	let hidden = $state(!documentVisible());
	let wasHidden = $state(false);

	let fetchSeq = 0;

	const refetch = async () => {
		if (isFetching) return;
		// After a failure, wait out the backoff window before trying again.
		if (failures > 0 && Date.now() < retryAt) return;
		isFetching = true;
		const seq = ++fetchSeq;
		try {
			const fresh = await queryClient.fetch(key, fetcher);
			if (seq === fetchSeq) {
				data = fresh;
				status = 'success';
				error = undefined;
				failures = 0;
				retryAt = 0;
				updatedAt = queryClient.get(key)?.updatedAt ?? Date.now();
			}
		} catch (e) {
			if (seq === fetchSeq) {
				error = e;
				failures += 1;
				retryAt = Date.now() + backoffMs();
				if (data === undefined) status = 'error';
			}
		} finally {
			if (seq === fetchSeq) isFetching = false;
		}
	};

	/** Background refetch that skips the network when the entry is still fresh. */
	const refetchIfStale = async () => {
		if (Date.now() - updatedAt <= staleTime) return;
		await refetch();
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

	// Track tab visibility so polling can pause instead of billing for
	// transfers nobody is looking at.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const onVisibility = () => {
			const nowHidden = document.visibilityState === 'hidden';
			if (hidden && !nowHidden) wasHidden = true;
			hidden = nowHidden;
		};
		onVisibility();
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	// Refetch once when the tab comes back to the foreground (data may have
	// changed while we were not polling).
	$effect(() => {
		if (!wasHidden || hidden) return;
		wasHidden = false;
		if (opts.refetchOnWindowFocus === false || opts.enabled === false) return;
		void refetchIfStale();
	});

	// Initial fetch when stale + optional polling. Converges: once data is
	// fresh, the staleness check is false and nothing re-triggers.
	$effect(() => {
		if (opts.enabled !== false) {
			const stale = Date.now() - updatedAt > staleTime;
			if (stale && !isFetching) void refetch();
		}
	});

	// Dedicated polling effect: restarted only when the cadence or visibility
	// changes, never on every `updatedAt` update.
	$effect(() => {
		const interval = opts.refetchInterval;
		if (!interval || opts.enabled === false) return;
		const paused = hidden && !opts.refetchIntervalInBackground;
		if (paused) return;
		const iv = setInterval(() => {
			if (document.visibilityState === 'hidden' && !opts.refetchIntervalInBackground) return;
			void refetchIfStale();
		}, interval);
		return () => clearInterval(iv);
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

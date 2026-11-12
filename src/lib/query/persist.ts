import { browser } from '$app/environment';

/**
 * Small `localStorage` mirror for public, non-personal payloads (the event
 * catalogue). A cold PWA start renders the last catalogue instead of waiting for
 * a network round trip; TanStack revalidates it in the background.
 *
 * Only call this for data that is safe to keep after a sign-out: the persisted
 * copy is readable by the next person who opens the device.
 */

const PREFIX = 'owltside.query.v2:';

interface PersistedEntry<T> {
	at: number;
	data: T;
}

function store(): Storage | null {
	if (!browser) return null;
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		// Private mode / storage disabled — the in-memory cache still works.
		return null;
	}
}

/**
 * The persisted payload plus when it was written. Feed `at` into TanStack's
 * `initialDataUpdatedAt` so an old snapshot is revalidated in the background
 * instead of being treated as freshly fetched.
 */
export function readPersistedEntry<T>(
	key: string,
	maxAgeMs: number
): { data: T; at: number } | undefined {
	const storage = store();
	if (!storage) return undefined;
	try {
		const raw = storage.getItem(PREFIX + key);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as PersistedEntry<T>;
		if (!parsed || typeof parsed.at !== 'number') return undefined;
		if (Date.now() - parsed.at > maxAgeMs) {
			storage.removeItem(PREFIX + key);
			return undefined;
		}
		return { data: parsed.data, at: parsed.at };
	} catch {
		return undefined;
	}
}

export function readPersisted<T>(key: string, maxAgeMs: number): T | undefined {
	return readPersistedEntry<T>(key, maxAgeMs)?.data;
}

export function writePersisted<T>(key: string, data: T): void {
	const storage = store();
	if (!storage) return;
	try {
		storage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies PersistedEntry<T>));
	} catch {
		// Quota exceeded (large payloads): drop the persisted copy rather than
		// letting a storage error break the in-memory cache.
		try {
			storage.removeItem(PREFIX + key);
		} catch {
			/* ignore */
		}
	}
}

export function clearPersisted(prefix = ''): void {
	const storage = store();
	if (!storage) return;
	try {
		const keys: string[] = [];
		for (let i = 0; i < storage.length; i += 1) {
			const key = storage.key(i);
			if (key?.startsWith(PREFIX + prefix)) keys.push(key);
		}
		for (const key of keys) storage.removeItem(key);
	} catch {
		/* ignore */
	}
}

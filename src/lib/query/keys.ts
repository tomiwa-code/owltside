/**
 * Every cache key the app uses.
 *
 * TanStack Query keys must be arrays, so each logical key is a single-element
 * array (`['conversations:mine']`). That keeps the readable `domain:scope`
 * shape from the app's previous cache, makes prefix invalidation trivial
 * (`keyMatchesPrefix`), and lets the imperative cache facade accept either the
 * bare string or the array form.
 *
 * Never build a key inline in a component — sharing these constants is what lets
 * the header, the inbox and the chat screen hit the same cache entry.
 */
export const queryKeys = {
	/** Public catalogue; shared by home + explore (same `/api/events` payload). */
	events: ['events:all'] as const,
	event: (slug: string) => [`events:${slug}`] as const,

	conversations: ['conversations:mine'] as const,
	messages: (conversationId: string) => [`messages:${conversationId}`] as const,
	messageRequests: ['message-requests:mine'] as const,

	notifications: ['notifications:mine'] as const,
	badges: ['badges:mine'] as const,

	tickets: ['tickets:mine'] as const,
	ticket: (id: string) => [`tickets:${id}`] as const,

	organizer: ['organizer:me'] as const,
	approvals: ['approvals:mine'] as const,

	connections: (profileId: string, kind: string) => [`connections:${profileId}:${kind}`] as const,
	profileSearch: (query: string) => [`profiles:search:${query.toLowerCase()}`] as const
} as const;

/** Prefix families for `invalidatePrefix()` (they match the keys above). */
export const keyFamilies = {
	events: 'events:',
	conversations: 'conversations:',
	messages: 'messages:',
	messageRequests: 'message-requests:',
	notifications: 'notifications:',
	badges: 'badges:',
	tickets: 'tickets:',
	organizer: 'organizer:',
	approvals: 'approvals:',
	connections: 'connections:',
	profiles: 'profiles:'
} as const;

/** Normalise the string form used by callers/tests into TanStack's array form. */
export function toQueryKey(key: string | readonly unknown[]): readonly unknown[] {
	return typeof key === 'string' ? [key] : key;
}

/** A query key's first segment starts with `prefix` — prefix invalidation. */
export function keyMatchesPrefix(key: unknown, prefix: string): boolean {
	if (typeof key === 'string') return key.startsWith(prefix);
	if (Array.isArray(key) && typeof key[0] === 'string') return key[0].startsWith(prefix);
	return false;
}

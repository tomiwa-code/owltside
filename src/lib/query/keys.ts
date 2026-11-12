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
	/** Home feed: newest public events (`/api/events`, default page). */
	events: ['events:all'] as const,
	/** Explore: the whole public catalogue (bounded pages, up to 200). */
	eventsCatalogue: ['events:catalogue'] as const,
	event: (slug: string) => [`events:${slug}`] as const,
	eventMessageRequest: (slug: string) => [`events:${slug}:message-request`] as const,

	conversations: ['conversations:mine'] as const,
	conversation: (conversationId: string) => [`conversations:${conversationId}`] as const,
	messages: (conversationId: string) => [`messages:${conversationId}`] as const,
	messageRequests: ['message-requests:mine'] as const,

	notifications: ['notifications:mine'] as const,
	badges: ['badges:mine'] as const,

	tickets: ['tickets:mine'] as const,
	ticket: (id: string) => [`tickets:${id}`] as const,

	profile: ['profile:me'] as const,

	organizer: ['organizer:me'] as const,
	organizerEvent: (eventId: string) => [`organizer:event:${eventId}`] as const,
	approvals: ['approvals:mine'] as const,

	user: (handle: string) => [`users:${handle.toLowerCase()}`] as const,

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
	profile: 'profile:',
	organizer: 'organizer:',
	approvals: 'approvals:',
	connections: 'connections:',
	profiles: 'profiles:',
	users: 'users:'
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

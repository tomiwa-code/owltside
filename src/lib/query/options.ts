import { queryOptions } from '@tanstack/svelte-query';
import type {
	ApprovalRequest,
	BadgeCounts,
	Conversation,
	EventItem,
	Message,
	MessageRequest,
	NotificationItem,
	OrganizerPayload,
	Profile,
	Ticket
} from '$lib/types';
import { pollFallbackMs } from '$lib/realtime';
import { STALE_TIME } from './client';
import { queryClient } from './cache';
import { queryKeys } from './keys';
import { readPersistedEntry, writePersisted } from './persist';

/**
 * Query option factories: one place that knows each endpoint's URL, cache key,
 * freshness window and fallback poll cadence.
 *
 * Screens call `createQuery(() => ticketsQueryOptions(data.tickets))` and get
 * server-rendered data as the initial value, so the first client render never
 * repeats the request the server load already made. TanStack then owns the
 * lifecycle: dedupe, background revalidation, focus/reconnect refetch, and
 * websocket-driven updates (see realtime-sync.ts).
 */

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = init ? await fetch(url, init) : await fetch(url);
	if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
	return (await response.json()) as T;
}

const EVENTS_PERSIST_MAX_AGE = 6 * 60 * 60 * 1000;

export function eventsQueryOptions(initialData?: EventItem[]) {
	// The catalogue is identical for every visitor and safe to keep on disk:
	// a cold start paints last visit's events while TanStack revalidates.
	const persisted = initialData ? undefined : readPersistedEntry<EventItem[]>(queryKeys.events[0], EVENTS_PERSIST_MAX_AGE);
	return queryOptions({
		queryKey: queryKeys.events,
		queryFn: async () => {
			const events = await getJson<EventItem[]>('/api/events');
			writePersisted(queryKeys.events[0], events);
			return events;
		},
		staleTime: STALE_TIME.catalogue,
		initialData: initialData ?? persisted?.data,
		initialDataUpdatedAt: initialData ? Date.now() : persisted?.at
	});
}

export function conversationsQueryOptions(initialData?: Conversation[]) {
	return queryOptions({
		queryKey: queryKeys.conversations,
		queryFn: ({ signal }) => getJson<Conversation[]>('/api/conversations', { signal }),
		staleTime: STALE_TIME.inbox,
		// Realtime patches this cache; polling only exists where there is no socket.
		refetchInterval: pollFallbackMs(60_000),
		initialData
	});
}

export function messagesQueryOptions(conversationId: string, initialData?: Message[]) {
	return queryOptions({
		queryKey: queryKeys.messages(conversationId),
		queryFn: ({ signal }) =>
			getJson<Message[]>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, { signal }),
		staleTime: STALE_TIME.inbox,
		refetchInterval: pollFallbackMs(60_000),
		initialData
	});
}

export function messageRequestsQueryOptions(initialData?: MessageRequest[]) {
	return queryOptions({
		queryKey: queryKeys.messageRequests,
		// Guests get a 200 with `[]`; a failed request stays an error so the
		// header keeps its server-rendered counter instead of showing zero.
		queryFn: ({ signal }) => getJson<MessageRequest[]>('/api/message-requests', { signal }),
		staleTime: STALE_TIME.inbox,
		refetchInterval: pollFallbackMs(120_000),
		initialData
	});
}

export function notificationsQueryOptions(initialData?: NotificationItem[]) {
	return queryOptions({
		queryKey: queryKeys.notifications,
		queryFn: ({ signal }) => getJson<NotificationItem[]>('/api/notifications', { signal }),
		staleTime: STALE_TIME.live,
		refetchInterval: pollFallbackMs(120_000),
		initialData
	});
}

export function badgesQueryOptions(initialData?: BadgeCounts) {
	return queryOptions({
		queryKey: queryKeys.badges,
		queryFn: async () => {
			const payload = await getJson<Partial<BadgeCounts>>('/api/badges');
			if (typeof payload?.unread !== 'number' || typeof payload?.inboxUnread !== 'number') {
				throw new Error('Badge counters are unavailable');
			}
			return {
				unread: payload.unread,
				inboxUnread: payload.inboxUnread,
				requests: payload.requests ?? 0
			} satisfies BadgeCounts;
		},
		staleTime: STALE_TIME.live,
		refetchInterval: pollFallbackMs(60_000),
		initialData
	});
}

export function ticketsQueryOptions(initialData?: Ticket[]) {
	return queryOptions({
		queryKey: queryKeys.tickets,
		queryFn: ({ signal }) => getJson<Ticket[]>('/api/tickets', { signal }),
		staleTime: 15_000,
		initialData
	});
}

export function organizerQueryOptions(initialData?: OrganizerPayload) {
	return queryOptions({
		queryKey: queryKeys.organizer,
		queryFn: ({ signal }) => getJson<OrganizerPayload>('/api/organizer', { signal }),
		staleTime: STALE_TIME.organizer,
		// Sales and check-ins are not published to Realtime, so this one keeps a
		// slow poll while the organizer console is open.
		refetchInterval: 120_000,
		initialData
	});
}

export function approvalsQueryOptions(initialData?: ApprovalRequest[]) {
	return queryOptions({
		queryKey: queryKeys.approvals,
		queryFn: ({ signal }) => getJson<ApprovalRequest[]>('/api/approvals', { signal }),
		staleTime: STALE_TIME.account,
		// Decisions land on the admin console; Realtime invalidates this key when
		// that is configured, with a slow poll as the demo-mode safety net.
		refetchInterval: pollFallbackMs(120_000),
		initialData
	});
}

export function connectionsQueryOptions(profileId: string, kind: 'followers' | 'following') {
	return queryOptions({
		queryKey: queryKeys.connections(profileId, kind),
		queryFn: ({ signal }) =>
			getJson<Profile[]>(`/api/profiles/${encodeURIComponent(profileId)}/connections?kind=${kind}`, {
				signal
			}),
		staleTime: STALE_TIME.account,
		// The sheet offers an explicit retry; a hidden auto-retry would fire a
		// second request the user did not ask for.
		retry: false
	});
}

/**
 * Typeahead lookup for the invite/transfer sheets. Imperative by nature (the
 * caller debounces keystrokes), but it still goes through the query cache so
 * retyping the same handle is free and concurrent lookups dedupe.
 */
export function fetchProfileSearch(term: string): Promise<Profile[]> {
	return queryClient.ensure(
		queryKeys.profileSearch(term),
		() => getJson<Profile[]>(`/api/profiles/search?q=${encodeURIComponent(term)}`),
		60_000
	);
}

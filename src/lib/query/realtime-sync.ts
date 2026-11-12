import { browser } from '$app/environment';
import type { QueryClient } from '@tanstack/svelte-query';
import { connectInboxSocket, type RealtimeStatus } from '$lib/realtime';
import type { BadgeCounts, Conversation, Message, NotificationItem } from '$lib/types';
import { getQueryClient } from './client';
import { keyMatchesPrefix, queryKeys } from './keys';

/**
 * The bridge between the messaging WebSocket and the query cache.
 *
 * Realtime events are *patched into* the cache rather than used as a trigger to
 * refetch: a new message appends to the open thread and updates the inbox row in
 * place, a notification prepends to the stream, and the header counters move by
 * one. That is what makes chat feel instant without a request per event.
 *
 * Changes we cannot reconstruct locally (a brand-new conversation needs the peer
 * profile; a message request needs the requester) fall back to a debounced
 * invalidation, so the cost stays at one small request per burst instead of one
 * per row.
 */

interface SyncOptions {
	/** Called for every inserted message, for OS-level push notifications. */
	onMessage?: (message: Message) => void;
	onStatus?: (status: RealtimeStatus) => void;
}

const INVALIDATE_DEBOUNCE_MS = 300;

/** A thread with a mounted query observer is the one on screen. */
function threadIsOpen(queryClient: QueryClient, conversationId: string): boolean {
	const query = queryClient.getQueryCache().find({ queryKey: queryKeys.messages(conversationId) });
	return (query?.getObserversCount() ?? 0) > 0;
}

function appendMessage(queryClient: QueryClient, message: Message): void {
	const key = queryKeys.messages(message.conversationId);
	const current = queryClient.getQueryData<Message[]>(key);
	if (!current) return; // thread closed: the next open fetches it
	if (current.some((existing) => existing.id === message.id)) return;
	queryClient.setQueryData<Message[]>(key, [...current, message]);
}

interface ConversationPatch {
	/** The message belonged to a thread already present in the inbox cache. */
	matched: boolean;
	/** The patch incremented a peer message the user has not seen yet. */
	countedUnread: boolean;
}

function patchConversations(
	queryClient: QueryClient,
	message: Message,
	currentUserId: string
): ConversationPatch {
	const current = queryClient.getQueryData<Conversation[]>(queryKeys.conversations);
	if (!current) return { matched: false, countedUnread: false };
	const open = threadIsOpen(queryClient, message.conversationId);
	let countedUnread = false;
	const next = current.map((conversation) => {
		if (conversation.id !== message.conversationId) return conversation;
		const fromPeer = message.senderId !== currentUserId;
		const unread = fromPeer && !open ? (conversation.unread ?? 0) + 1 : (conversation.unread ?? 0);
		if (fromPeer && !open) countedUnread = true;
		return { ...conversation, lastMessage: message.body, lastAt: message.sentAt, unread };
	});
	const matched = next.some((conversation, index) => conversation !== current[index]);
	queryClient.setQueryData<Conversation[]>(queryKeys.conversations, next);
	return { matched, countedUnread };
}

function patchBadges(queryClient: QueryClient, delta: Partial<BadgeCounts>): void {
	const current = queryClient.getQueryData<BadgeCounts>(queryKeys.badges);
	if (!current) return;
	queryClient.setQueryData<BadgeCounts>(queryKeys.badges, {
		unread: Math.max(0, current.unread + (delta.unread ?? 0)),
		inboxUnread: Math.max(0, current.inboxUnread + (delta.inboxUnread ?? 0)),
		requests: Math.max(0, current.requests + (delta.requests ?? 0))
	});
}

const NOTIFICATION_KINDS = new Set<NotificationItem['kind']>([
	'event',
	'ticket',
	'social',
	'system',
	'promo',
	'announcement'
]);

function notificationKind(value: unknown): NotificationItem['kind'] {
	return NOTIFICATION_KINDS.has(value as NotificationItem['kind'])
		? (value as NotificationItem['kind'])
		: 'system';
}

function prependNotification(queryClient: QueryClient, row: Record<string, unknown>): boolean {
	if (!row?.id) return false;
	const key = queryKeys.notifications;
	const current = queryClient.getQueryData<NotificationItem[]>(key);
	if (!current) return false;
	if (current.some((item) => item.id === String(row.id))) return false;
	const item: NotificationItem = {
		id: String(row.id),
		kind: notificationKind(row.kind),
		title: String(row.title ?? ''),
		body: String(row.body ?? ''),
		href: typeof row.href === 'string' ? row.href : undefined,
		at: String(row.at ?? new Date().toISOString()),
		read: row.read === true
	};
	queryClient.setQueryData<NotificationItem[]>(key, [item, ...current]);
	return !item.read;
}

/**
 * Start the socket + cache bridge for a signed-in user. Returns a cleanup that
 * closes every channel (call it on sign-out or when the user id changes).
 */
export function startRealtimeSync(userId: string, options: SyncOptions = {}): () => void {
	if (!browser || !userId) return () => {};
	const queryClient = getQueryClient();
	const pending = new Map<string, ReturnType<typeof setTimeout>>();
	let connectedOnce = false;
	// Realtime can redeliver after a reconnect; a message id only counts once.
	const seenMessages = new Set<string>();
	// The thread UPDATE that follows an insert is already reflected by the local
	// patch; remembering it avoids a refetch per message.
	let lastPatch = { at: 0, matched: false };

	const invalidateSoon = (prefix: string) => {
		const existing = pending.get(prefix);
		if (existing) clearTimeout(existing);
		pending.set(
			prefix,
			setTimeout(() => {
				pending.delete(prefix);
				queryClient.invalidateQueries({ predicate: (query) => keyMatchesPrefix(query.queryKey, prefix) });
			}, INVALIDATE_DEBOUNCE_MS)
		);
	};

	const stop = connectInboxSocket(userId, {
		onMessage: (message) => {
			if (message.id) {
				if (seenMessages.has(message.id)) return;
				seenMessages.add(message.id);
				if (seenMessages.size > 500) {
					const oldest = seenMessages.values().next().value;
					if (oldest) seenMessages.delete(oldest);
				}
			}
			appendMessage(queryClient, message);
			const patch = patchConversations(queryClient, message, userId);
			lastPatch = { at: Date.now(), matched: patch.matched };
			if (patch.countedUnread) patchBadges(queryClient, { inboxUnread: 1 });
			options.onMessage?.(message);
		},
		onNotification: (row) => {
			// Without a cached stream there is nothing to prepend to; refetch it
			// (and the counter it backs) once the burst settles.
			if (prependNotification(queryClient, row)) {
				patchBadges(queryClient, { unread: 1 });
				return;
			}
			invalidateSoon('notifications:');
			invalidateSoon('badges:');
		},
		onConversation: () => {
			// The UPDATE that trails a message insert is already applied above.
			if (lastPatch.matched && Date.now() - lastPatch.at < 2_000) return;
			// Otherwise a new thread needs the peer profile, or counts moved
			// somewhere we cannot reconstruct locally (read on another device).
			invalidateSoon('conversations:');
			invalidateSoon('badges:');
		},
		onMessageRequest: () => {
			invalidateSoon('message-requests:');
			invalidateSoon('badges:');
		},
		onApproval: () => invalidateSoon('approvals:'),
		onStatus: (status) => {
			options.onStatus?.(status);
			if (status === 'connected') {
				// After a drop we may have missed events; reconcile active queries
				// once the socket is back (cheap: only mounted screens refetch).
				if (connectedOnce) {
					void queryClient.invalidateQueries({ refetchType: 'active' });
				}
				connectedOnce = true;
			}
		}
	});

	return () => {
		for (const timer of pending.values()) clearTimeout(timer);
		pending.clear();
		stop();
	};
}

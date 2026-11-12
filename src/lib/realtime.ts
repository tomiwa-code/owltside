import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Message } from './types';

/**
 * WebSocket transport for messaging and live badges.
 *
 * Supabase Realtime is a WebSocket (Phoenix channel) connection. We open one
 * socket and attach narrowly-scoped channels instead of letting each screen
 * subscribe on its own:
 *
 *   messages            INSERT   → append to the open thread, patch the inbox row
 *   conversations       *        → the caller's thread list changed
 *   message_requests    *        → a first-contact request arrived / was answered
 *   notifications       *        → the user's notification stream changed
 *   approval_requests   *        → a refund/payout/verification decision landed
 *
 * Row Level Security applies to `postgres_changes`, so a subscriber only ever
 * receives rows it is allowed to read. When Supabase is not configured (demo
 * mode) every function degrades to a no-op and the query layer falls back to its
 * slow poll (`pollFallbackMs`).
 */

export type RealtimeStatus = 'unavailable' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

let client: SupabaseClient | null = null;

export function publicSupabase(): SupabaseClient | null {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!browser || !url || !key) return null;
	if (!client) client = createBrowserClient(url, key);
	return client;
}

/** True when a live socket can exist in this environment. */
export function realtimeAvailable(): boolean {
	return publicSupabase() !== null;
}

/**
 * How often a screen should poll as a *fallback*. Realtime is the primary
 * transport wherever it exists, so live screens do not poll at all; demo mode
 * (and a browser with the socket blocked) keeps a slow safety net.
 */
export function pollFallbackMs(fallbackMs = 3 * 60_000): number | false {
	return realtimeAvailable() ? false : fallbackMs;
}

function syncRealtimeAuth(db: SupabaseClient): Promise<void> {
	return db.auth
		.getSession()
		.then(({ data }) => {
			if (data.session?.access_token) db.realtime.setAuth(data.session.access_token);
		})
		.catch(() => {
			// Without a token the channel simply receives nothing; the poll
			// fallback and focus refetch still keep the data honest.
		});
}

function toMessage(row: Record<string, unknown>): Message {
	return {
		id: String(row.id ?? ''),
		conversationId: String(row.conversation_id ?? ''),
		senderId: String(row.sender_id ?? ''),
		body: String(row.body ?? ''),
		sentAt: String(row.sent_at ?? new Date().toISOString())
	};
}

export interface InboxSocketHandlers {
	onMessage?: (message: Message) => void;
	onNotification?: (row: Record<string, unknown>) => void;
	onConversation?: (event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
	onMessageRequest?: () => void;
	onApproval?: () => void;
	onStatus?: (status: RealtimeStatus) => void;
}

let channelSeq = 0;

/**
 * Open the inbox socket for one user and fan its events out to `handlers`.
 * Returns an unsubscribe function that removes every channel.
 */
export function connectInboxSocket(userId: string, handlers: InboxSocketHandlers): () => void {
	const db = publicSupabase();
	if (!browser || !db || !userId) {
		handlers.onStatus?.('unavailable');
		return () => {};
	}

	const channels: RealtimeChannel[] = [];
	const expected = 6;
	let subscribed = 0;
	let lastStatus: RealtimeStatus = 'connecting';
	let closed = false;

	const setStatus = (next: RealtimeStatus) => {
		if (closed || next === lastStatus) return;
		lastStatus = next;
		handlers.onStatus?.(next);
	};

	const track = (channel: RealtimeChannel) => {
		channel.subscribe((status) => {
			if (closed) return;
			if (status === 'SUBSCRIBED') {
				subscribed += 1;
				if (subscribed >= expected) setStatus('connected');
				else setStatus('connecting');
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
				subscribed = 0;
				setStatus('reconnecting');
			} else if (status === 'CLOSED') {
				setStatus('offline');
			}
		});
		channels.push(channel);
	};

	setStatus('connecting');
	void syncRealtimeAuth(db);
	const suffix = `${userId}:${++channelSeq}`;

	track(
		db
			.channel(`inbox:messages:${suffix}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'messages' },
				(payload) => handlers.onMessage?.(toMessage(payload.new as Record<string, unknown>))
			)
	);

	track(
		db
			.channel(`inbox:conversations:owner:${suffix}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${userId}` },
				(payload) => handlers.onConversation?.(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE')
			)
	);

	track(
		db
			.channel(`inbox:conversations:peer:${suffix}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'conversations', filter: `peer_id=eq.${userId}` },
				(payload) => handlers.onConversation?.(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE')
			)
	);

	track(
		db
			.channel(`inbox:requests:${suffix}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'message_requests', filter: `organizer_id=eq.${userId}` },
				() => handlers.onMessageRequest?.()
			)
	);

	track(
		db
			.channel(`inbox:notifications:${suffix}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
				(payload) => handlers.onNotification?.(payload.new as Record<string, unknown>)
			)
	);

	track(
		db
			.channel(`inbox:approvals:${suffix}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'approval_requests', filter: `requester_id=eq.${userId}` },
				() => handlers.onApproval?.()
			)
	);

	// A phone that backgrounded loses the socket; ask the query layer to
	// reconcile as soon as the tab is visible again.
	const onVisible = () => {
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
			if (lastStatus !== 'connected') void syncRealtimeAuth(db);
		}
	};
	if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

	return () => {
		closed = true;
		if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
		for (const channel of channels) void db.removeChannel(channel);
	};
}

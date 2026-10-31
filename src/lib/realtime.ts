import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Message } from './types';

/**
 * Chat & notification realtime transport.
 * - Supabase mode: uses `@supabase/ssr`'s `createBrowserClient` so the browser
 *   Realtime WebSocket automatically authenticates with the SSR session cookies
 *   required by Row Level Security on `messages`, `conversations`,
 *   `message_requests`, and `notifications`.
 * - Demo mode: pages poll via `useQuery(refetchInterval)`.
 */
export interface ChatTransport {
	subscribe(conversationId: string, onMessage: (m: Message) => void): () => void;
}

let client: SupabaseClient | null = null;

export function publicSupabase(): SupabaseClient | null {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!browser || !url || !key) return null;
	if (!client) client = createBrowserClient(url, key);
	return client;
}

function syncRealtimeAuth(db: SupabaseClient): void {
	void db.auth
		.getSession()
		.then(({ data }) => {
			if (data.session?.access_token) {
				db.realtime.setAuth(data.session.access_token);
			}
		})
		.catch(() => {
			// Ignore auth lookup errors; polling remains active as fallback.
		});
}

export function createChatTransport(): ChatTransport {
	return {
		subscribe(conversationId, onMessage) {
			const db = publicSupabase();
			if (!db) return () => {};
			syncRealtimeAuth(db);
			let channel: RealtimeChannel | null = null;
			channel = db
				.channel(`messages:${conversationId}`)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'messages',
						filter: `conversation_id=eq.${conversationId}`
					},
					(payload) => {
						const r = payload.new as Record<string, unknown>;
						onMessage({
							id: String(r.id),
							conversationId,
							senderId: String(r.sender_id),
							body: String(r.body),
							sentAt: String(r.sent_at)
						});
					}
				)
				.subscribe();
			return () => {
				if (channel) void db.removeChannel(channel);
			};
		}
	};
}

export function subscribeIncomingMessages(
	currentUserId: string,
	onMessage: (m: Message) => void
): () => void {
	const db = publicSupabase();
	if (!db || !currentUserId) return () => {};
	syncRealtimeAuth(db);
	const channel = db
		.channel(`inbox-incoming:${currentUserId}`)
		.on(
			'postgres_changes',
			{
				event: 'INSERT',
				schema: 'public',
				table: 'messages'
			},
			(payload) => {
				const r = payload.new as Record<string, unknown>;
				const senderId = String(r.sender_id ?? '');
				if (!senderId || senderId === currentUserId) return;
				onMessage({
					id: String(r.id ?? ''),
					conversationId: String(r.conversation_id ?? ''),
					senderId,
					body: String(r.body ?? ''),
					sentAt: String(r.sent_at ?? new Date().toISOString())
				});
			}
		)
		.subscribe();
	return () => {
		void db.removeChannel(channel);
	};
}

export function subscribeTable(
	table: string,
	onChange: () => void,
	filter?: string
): () => void {
	const db = publicSupabase();
	if (!db) return () => {};
	syncRealtimeAuth(db);
	const channel = db
		.channel(`realtime:${table}:${filter ?? 'all'}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table,
				...(filter ? { filter } : {})
			},
			() => onChange()
		)
		.subscribe();
	return () => {
		void db.removeChannel(channel);
	};
}

import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Message } from './types';

/**
 * Chat transport.
 * - Supabase mode: Realtime channel on `messages` inserts (what Supabase offers
 *   out of the box — no separate socket server needed).
 * - Demo mode: the peer replies server-side; the page polls with
 *   useQuery(refetchInterval) so new messages appear automatically.
 */
export interface ChatTransport {
	subscribe(conversationId: string, onMessage: (m: Message) => void): () => void;
}

let client: SupabaseClient | null = null;

export function publicSupabase(): SupabaseClient | null {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!browser || !url || !key) return null;
	if (!client) client = createClient(url, key);
	return client;
}

export function createChatTransport(): ChatTransport {
	return {
		subscribe(conversationId, onMessage) {
			const db = publicSupabase();
			if (!db) return () => {};
			let channel: RealtimeChannel | null = null;
			channel = db
				.channel(`messages:${conversationId}`)
				.on(
					'postgres_changes',
					{ event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
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

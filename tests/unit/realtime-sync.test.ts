import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message } from '$lib/types';
import { queryClient } from '$lib/query/cache';
import { queryKeys } from '$lib/query/keys';

/**
 * The WebSocket → cache bridge. `connectInboxSocket` is stubbed so the test can
 * deliver the same payloads Supabase Realtime would, then assert the cache moved
 * without any refetch.
 */
const socket = vi.hoisted(() => ({
	handlers: null as null | {
		onMessage?: (message: { id: string; conversationId: string; senderId: string; body: string; sentAt: string }) => void;
		onNotification?: (row: Record<string, unknown>) => void;
		onMessageRequest?: () => void;
		onConversation?: () => void;
		onStatus?: (status: string) => void;
	},
	connect: vi.fn()
}));

vi.mock('$lib/realtime', () => ({
	connectInboxSocket: (_userId: string, handlers: NonNullable<typeof socket.handlers>) => {
		socket.handlers = handlers;
		socket.connect(_userId);
		return () => {
			socket.handlers = null;
		};
	},
	realtimeAvailable: () => true,
	pollFallbackMs: () => false
}));

import { startRealtimeSync } from '$lib/query/realtime-sync';

const ME = 'u-me';
const at = '2026-11-12T12:00:00.000Z';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
	return {
		id: 'c1',
		peer: { id: 'u-peer', handle: 'peer', name: 'Peer', avatarColor: '#123456', followers: 0, following: 0, verified: false },
		lastMessage: 'older',
		lastAt: at,
		unread: 0,
		...overrides
	};
}

function message(overrides: Partial<Message> = {}): Message {
	return { id: 'm2', conversationId: 'c1', senderId: 'u-peer', body: 'hello live', sentAt: at, ...overrides };
}

function seed() {
	queryClient.set(queryKeys.messages('c1'), [
		{ id: 'm1', conversationId: 'c1', senderId: 'u-peer', body: 'older', sentAt: at }
	] satisfies Message[]);
	queryClient.set(queryKeys.conversations, [conversation()]);
	queryClient.set(queryKeys.badges, { unread: 0, inboxUnread: 0, requests: 0 });
	queryClient.set(queryKeys.notifications, []);
}

afterEach(() => {
	vi.useRealTimers();
	socket.handlers = null;
	socket.connect.mockClear();
});

describe('messaging WebSocket → TanStack cache', () => {
	it('appends an incoming message, updates the inbox row and the badge', () => {
		seed();
		const stop = startRealtimeSync(ME);
		expect(socket.connect).toHaveBeenCalledWith(ME);

		socket.handlers?.onMessage?.(message());

		expect(queryClient.get<Message[]>(queryKeys.messages('c1'))?.data.map((m) => m.id)).toEqual([
			'm1',
			'm2'
		]);
		const row = queryClient.get<Conversation[]>(queryKeys.conversations)?.data[0];
		expect(row?.lastMessage).toBe('hello live');
		expect(row?.unread).toBe(1);
		expect(queryClient.get<{ inboxUnread: number }>(queryKeys.badges)?.data.inboxUnread).toBe(1);
		stop();
	});

	it('does not count the user’s own message as unread', () => {
		seed();
		startRealtimeSync(ME);
		socket.handlers?.onMessage?.(message({ id: 'm3', senderId: ME, body: 'mine' }));
		expect(queryClient.get<Conversation[]>(queryKeys.conversations)?.data[0].unread).toBe(0);
		expect(queryClient.get<{ inboxUnread: number }>(queryKeys.badges)?.data.inboxUnread).toBe(0);
	});

	it('ignores a duplicate delivery of the same message', () => {
		seed();
		startRealtimeSync(ME);
		const payload = message();
		socket.handlers?.onMessage?.(payload);
		socket.handlers?.onMessage?.(payload);
		expect(queryClient.get<Message[]>(queryKeys.messages('c1'))?.data).toHaveLength(2);
		expect(queryClient.get<Conversation[]>(queryKeys.conversations)?.data[0].unread).toBe(1);
	});

	it('prepends a notification and moves the unread badge', () => {
		seed();
		startRealtimeSync(ME);
		socket.handlers?.onNotification?.({
			id: 'n1',
			kind: 'ticket',
			title: 'Ticket confirmed',
			body: 'Your pass is ready',
			href: '/tickets/t1',
			at,
			read: false
		});
		const notifications = queryClient.get<{ id: string }[]>(queryKeys.notifications)?.data;
		expect(notifications?.[0]?.id).toBe('n1');
		expect(queryClient.get<{ unread: number }>(queryKeys.badges)?.data.unread).toBe(1);
	});

	it('debounces invalidation for rows it cannot patch locally', () => {
		vi.useFakeTimers();
		seed();
		startRealtimeSync(ME);
		queryClient.set(queryKeys.messageRequests, []);
		socket.handlers?.onMessageRequest?.();
		expect(queryClient.client.getQueryState(queryKeys.messageRequests)?.isInvalidated).toBe(false);
		vi.advanceTimersByTime(400);
		expect(queryClient.client.getQueryState(queryKeys.messageRequests)?.isInvalidated).toBe(true);
	});

	it('closes the socket when the sync is stopped', () => {
		seed();
		const stop = startRealtimeSync(ME);
		expect(socket.handlers).not.toBeNull();
		stop();
		expect(socket.handlers).toBeNull();
	});
});

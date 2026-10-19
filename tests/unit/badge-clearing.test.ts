import AppHeader from '$components/AppHeader.svelte';
import { queryClient } from '$lib/state/query.svelte';
import type { Conversation, Message, NotificationItem, Profile } from '$lib/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '$lib/server/datasource';
import { page } from '$app/state';
import NotificationsPage from '../../src/routes/(app)/notifications/+page.svelte';
import ChatPage from '../../src/routes/(app)/inbox/[id]/+page.svelte';
import { POST as acknowledgeNotifications } from '../../src/routes/api/notifications/read/+server';
import { POST as acknowledgeThread } from '../../src/routes/api/conversations/[id]/read/+server';

const at = new Date().toISOString();

function profile(id: string, handle: string, name: string): Profile {
	return { id, handle, name, avatarColor: '#123456', followers: 0, following: 0, verified: false };
}

function notification(read: boolean): NotificationItem {
	return { id: 'n-1', kind: 'ticket', title: 'Pass issued', body: 'Your pass is ready.', at, read };
}

function conversation(unread: number, id = 'c-1'): Conversation {
	return {
		id,
		peer: profile(`u-${id}`, `peer-${id}`, 'Chat Peer'),
		lastMessage: 'See you at the gate',
		lastAt: at,
		unread
	};
}

const messages: Message[] = [
	{ id: 'm-1', conversationId: 'c-1', senderId: 'u-c-1', body: 'See you at the gate', sentAt: at }
];

const cookies = { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} };

const layout = {
	unread: 0,
	operatingIdentity: 'attendee' as const,
	session: { userId: 'u-me', email: 'ada@example.test', handle: 'ada', name: 'Ada', role: 'attendee' as const, avatarUrl: null },
	demoMode: true,
	currentProfile: null,
	followingIds: [] as string[],
	inboxUnread: 0,
	followLoadError: false
};

beforeEach(() => {
	Object.assign(page.data, {
		session: { userId: 'u-me', name: 'Ada', handle: 'ada', role: 'attendee', avatarUrl: null },
		currentProfile: null,
		unread: 0,
		inboxUnread: 0,
		operatingIdentity: 'attendee'
	});
});

afterEach(() => {
	cleanup();
	queryClient.invalidate('notifications');
	queryClient.invalidate('conversations');
	queryClient.invalidate('message-requests');
	vi.unstubAllGlobals();
});

describe('notification badge clears when the hub is opened', () => {
	it('drops the header badge as soon as the bell is clicked', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/conversations') || url.includes('/api/message-requests')) {
				return new Response('[]');
			}
			return new Response('{"ok":true}');
		});
		vi.stubGlobal('fetch', fetchMock);

		queryClient.set('notifications:mine', [notification(false)]);
		render(AppHeader);

		const link = screen.getByRole('link', { name: 'Notifications, 1 unread' });
		expect(link.querySelector('span')?.textContent?.trim()).toBe('1');
		// jsdom has no client router; keep it from attempting a real navigation.
		link.addEventListener('click', (event) => event.preventDefault());

		await fireEvent.click(link);

		await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument());
		expect(link.querySelector('span')).toBeNull();
		expect(queryClient.get<NotificationItem[]>('notifications:mine')?.data.every((n) => n.read)).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith('/api/notifications/read', { method: 'POST' });
	});

	it('publishes the acknowledged stream from the notifications screen to the header cache', async () => {
		queryClient.set('notifications:mine', [notification(false)]);
		render(AppHeader);
		expect(screen.getByRole('link', { name: 'Notifications, 1 unread' })).toBeInTheDocument();

		render(NotificationsPage, { data: { ...layout, items: [notification(true)] } });
		await tick();

		await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument());
		expect(queryClient.get<NotificationItem[]>('notifications:mine')?.data).toEqual([notification(true)]);

		// A stale background poll re-applying the unread state is corrected
		// while the hub stays open.
		queryClient.set('notifications:mine', [notification(false)]);
		await waitFor(() =>
			expect(queryClient.get<NotificationItem[]>('notifications:mine')?.data[0].read).toBe(true)
		);
	});
});

describe('inbox badge clears when a chat screen is opened', () => {
	it('publishes the read thread from the chat screen to the header cache', async () => {
		queryClient.set('conversations:mine', [conversation(2)]);
		render(AppHeader);
		expect(screen.getByRole('link', { name: 'Inbox, 2 unread' })).toBeInTheDocument();

		render(ChatPage, {
			data: {
				...layout,
				conversation: conversation(2),
				messages,
				conversations: [conversation(2)]
			}
		});
		await tick();

		await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument());
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data).toEqual([conversation(0)]);

		// A background conversations poll re-applying the unread count while the
		// chat stays open is neutralised too.
		queryClient.set('conversations:mine', [conversation(2)]);
		await waitFor(() =>
			expect(queryClient.get<Conversation[]>('conversations:mine')?.data[0].unread).toBe(0)
		);
	});

	it('persists the acknowledgement when the chat screen opens', async () => {
		const before = (await demoSource.getConversations('u-ada')).find((c) => c.id === 'c-amina');
		expect(before?.unread).toBe(2);

		const response = await acknowledgeThread({
			params: { id: 'c-amina' },
			locals: { session: { userId: 'u-ada' } },
			cookies
		} as never);
		expect(await response.json()).toEqual({ ok: true });

		const conversations = await demoSource.getConversations('u-ada');
		expect(conversations.find((c) => c.id === 'c-amina')?.unread).toBe(0);
	});
});

describe('notification acknowledgement endpoint', () => {
	it('marks the whole stream read', async () => {
		const before = await demoSource.getNotifications('u-ada');
		expect(before.some((n) => !n.read)).toBe(true);

		const response = await acknowledgeNotifications({
			locals: { session: { userId: 'u-ada' } },
			cookies
		} as never);
		expect(await response.json()).toEqual({ ok: true });

		const after = await demoSource.getNotifications('u-ada');
		expect(after.length).toBeGreaterThan(0);
		expect(after.every((n) => n.read)).toBe(true);
	});

	it('rejects guests instead of mutating shared demo state', async () => {
		const notificationsResponse = await acknowledgeNotifications({
			locals: { session: null },
			cookies
		} as never);
		expect(notificationsResponse.status).toBe(401);

		const threadResponse = await acknowledgeThread({
			params: { id: 'c-amina' },
			locals: { session: null },
			cookies
		} as never);
		expect(threadResponse.status).toBe(401);
	});
});

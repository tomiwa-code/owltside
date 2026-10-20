import AppHeader from '$components/AppHeader.svelte';
import { queryClient } from '$lib/state/query.svelte';
import type { Conversation, Message, Profile } from '$lib/types';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import InboxPage from '../../src/routes/(app)/inbox/+page.svelte';
import ChatPage from '../../src/routes/(app)/inbox/[id]/+page.svelte';

const at = new Date().toISOString();

function profile(id: string, name: string): Profile {
	return { id, handle: id, name, avatarColor: '#123456', followers: 0, following: 0, verified: false };
}

function conversation(id: string, name: string, unread: number): Conversation {
	return { id, peer: profile(`u-${id}`, name), lastMessage: `Last message from ${name}`, lastAt: at, unread };
}

const personA = () => conversation('c-a', 'Person A', 2);
const personB = () => conversation('c-b', 'Person B', 1);
const messages: Message[] = [
	{ id: 'm-1', conversationId: 'c-a', senderId: 'u-c-b', body: 'hello', sentAt: at }
];

const session = {
	userId: 'u-me',
	email: 'ada@example.test',
	handle: 'ada',
	name: 'Ada',
	role: 'attendee' as const,
	avatarUrl: null
};

const layout = {
	unread: 0,
	operatingIdentity: 'attendee' as const,
	session,
	demoMode: true,
	currentProfile: null,
	followingIds: [] as string[],
	inboxUnread: 3,
	followLoadError: false
};

const conversationsPayload = () => [personA(), personB()];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	queryClient.invalidate('notifications');
	queryClient.invalidate('conversations');
	queryClient.invalidate('message-requests');
	Object.assign(page.data, layout);
	Object.assign(page.data, { session });
	fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes('/messages')) return new Response(JSON.stringify(messages));
		if (url.includes('/api/conversations')) return new Response(JSON.stringify(conversationsPayload()));
		if (url.includes('/api/message-requests')) return new Response('[]');
		if (url.includes('/api/notifications')) return new Response('[]');
		return new Response('{"ok":true}');
	});
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
	cleanup();
	// Polls still in flight when a test ends must not repopulate the shared
	// cache for the next test.
	vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('test teardown'))));
	queryClient.invalidate('notifications');
	queryClient.invalidate('conversations');
	queryClient.invalidate('message-requests');
	await new Promise((resolve) => setTimeout(resolve, 0));
	vi.unstubAllGlobals();
});

describe('inbox unread counts', () => {
	it('keeps the header badge while the inbox list is open, and shows each chat count', async () => {
		queryClient.set('conversations:mine', [personA(), personB()]);
		render(AppHeader);

		render(InboxPage, {
			data: { ...layout, conversations: conversationsPayload(), messageRequests: [] }
		});

		// The main badge is the sum of the two chats and does not clear from
		// merely opening the inbox.
		expect(await screen.findByRole('link', { name: 'Inbox, 3 unread' })).toBeInTheDocument();

		// Every chat box carries its own count (mobile row + desktop panel row).
		expect(screen.getAllByLabelText('2 unread from Person A')).toHaveLength(2);
		expect(screen.getAllByLabelText('1 unread from Person B')).toHaveLength(2);

		// Opening the list must not persist read state anywhere.
		const readCalls = fetchMock.mock.calls.filter(([url]) => String(url).match(/\/read$/));
		expect(readCalls).toHaveLength(0);
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data.map((c) => c.unread)).toEqual([2, 1]);
	});

	it('clears only the opened chat, leaving the other chat count in place', async () => {
		queryClient.set('conversations:mine', [personA(), personB()]);
		render(AppHeader);
		expect(await screen.findByRole('link', { name: 'Inbox, 3 unread' })).toBeInTheDocument();

		const chatA = render(ChatPage, {
			data: {
				...layout,
				conversation: personA(),
				messages,
				conversations: conversationsPayload()
			}
		});

		// Person A is acknowledged, Person B still counts.
		await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox, 1 unread' })).toBeInTheDocument());
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data.map((c) => c.unread)).toEqual([0, 1]);
		chatA.unmount();

		// Opening the remaining chat clears the badge completely.
		render(ChatPage, {
			data: {
				...layout,
				conversation: personB(),
				messages: [],
				conversations: conversationsPayload()
			}
		});

		await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument());
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data.map((c) => c.unread)).toEqual([0, 0]);
	});

	it('never resurrects a cleared count when another chat is opened with a stale snapshot', async () => {
		queryClient.set('conversations:mine', [personA(), personB()]);
		render(AppHeader);

		// Person A read, so its share is gone and only Person B counts.
		const chatA = render(ChatPage, {
			data: { ...layout, conversation: personA(), messages, conversations: conversationsPayload() }
		});
		await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox, 1 unread' })).toBeInTheDocument());
		chatA.unmount();

		// Opening Person B hands the page the same (now stale) snapshot where
		// Person A still shows 2 unread. That must not come back.
		render(ChatPage, {
			data: { ...layout, conversation: personB(), messages: [], conversations: conversationsPayload() }
		});

		await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument());
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data.map((c) => c.unread)).toEqual([0, 0]);
	});

	it('falls back to the server counts when the badge APIs fail', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ error: 'upstream unavailable' }), { status: 500 }))
		);
		Object.assign(page.data, { unread: 4, inboxUnread: 3 });

		render(AppHeader);

		expect(await screen.findByRole('link', { name: 'Notifications, 4 unread' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Inbox, 3 unread' })).toBeInTheDocument();
	});

	it('frames unread counts as 99+ with the shared badge', async () => {
		queryClient.set('conversations:mine', [conversation('c-big', 'Busy Peer', 120)]);
		render(AppHeader);

		expect(await screen.findByRole('link', { name: 'Inbox, 120 unread' })).toBeInTheDocument();
		expect(screen.getByText('99+')).toBeInTheDocument();
	});
});

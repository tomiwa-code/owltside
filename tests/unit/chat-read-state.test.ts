import { queryClient } from '$lib/state/query.svelte';
import { demoSource, supabaseSource } from '$lib/server/datasource';
import type { Conversation, Message, Profile } from '$lib/types';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import type { SupabaseClient } from '@supabase/supabase-js';
import ChatPage from '../../src/routes/(app)/inbox/[id]/+page.svelte';
import { POST as acknowledgeThread } from '../../src/routes/api/conversations/[id]/read/+server';

const at = new Date().toISOString();

function profile(id: string, name: string): Profile {
	return { id, handle: id, name, avatarColor: '#123456', followers: 0, following: 0, verified: false };
}

function conversation(unread: number, id = 'c-1'): Conversation {
	return { id, peer: profile(`u-${id}`, 'Chat Peer'), lastMessage: 'hello', lastAt: at, unread };
}

const messages: Message[] = [
	{ id: 'm-1', conversationId: 'c-1', senderId: 'u-c-1', body: 'hello', sentAt: at }
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
	inboxUnread: 0,
	followLoadError: false
};

const cookies = { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} };

let readPosts: string[];

beforeEach(() => {
	readPosts = [];
	Object.assign(page.data, layout);
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/read')) readPosts.push(url);
			return new Response('{"ok":true}');
		})
	);
});

afterEach(() => {
	cleanup();
	vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('test teardown'))));
	queryClient.invalidate('notifications');
	queryClient.invalidate('conversations');
	queryClient.invalidate('message-requests');
	vi.unstubAllGlobals();
});

describe('opening a chat acknowledges it for the receiver only', () => {
	it('acknowledges once on open and leaves later messages unread', async () => {
		queryClient.set('conversations:mine', [conversation(2)]);
		render(ChatPage, {
			data: { ...layout, conversation: conversation(2), messages, conversations: [conversation(2)] }
		});

		await waitFor(() => expect(readPosts).toHaveLength(1));
		expect(readPosts[0]).toBe('/api/conversations/c-1/read');
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data[0].unread).toBe(0);

		// A message arrives while the chat stays mounted (a poll re-applies the
		// count). The session being open must not acknowledge it.
		queryClient.set('conversations:mine', [conversation(1)]);
		await tick();
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data[0].unread).toBe(1);
		expect(readPosts).toHaveLength(1);
	});

	it('acknowledges again when the receiver opens the thread again', async () => {
		queryClient.set('conversations:mine', [conversation(2)]);
		const first = render(ChatPage, {
			data: { ...layout, conversation: conversation(2), messages, conversations: [conversation(2)] }
		});
		await waitFor(() => expect(readPosts).toHaveLength(1));
		first.unmount();

		// A new message landed while the thread was closed.
		queryClient.set('conversations:mine', [conversation(1)]);
		render(ChatPage, {
			data: { ...layout, conversation: conversation(1), messages, conversations: [conversation(1)] }
		});

		await waitFor(() => expect(readPosts).toHaveLength(2));
		expect(queryClient.get<Conversation[]>('conversations:mine')?.data[0].unread).toBe(0);
	});

	it('does not acknowledge a thread opened in a background tab until it is visible', async () => {
		let visibility: 'visible' | 'hidden' = 'hidden';
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => visibility
		});
		try {
			queryClient.set('conversations:mine', [conversation(2)]);
			render(ChatPage, {
				data: { ...layout, conversation: conversation(2), messages, conversations: [conversation(2)] }
			});
			await tick();
			expect(readPosts).toHaveLength(0);
			expect(queryClient.get<Conversation[]>('conversations:mine')?.data[0].unread).toBe(2);

			visibility = 'visible';
			document.dispatchEvent(new Event('visibilitychange'));

			await waitFor(() => expect(readPosts).toHaveLength(1));
			expect(queryClient.get<Conversation[]>('conversations:mine')?.data[0].unread).toBe(0);
		} finally {
			Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
		}
	});
});

describe('demo read state is per participant', () => {
	it('keeps a reply unread until the demo account opens that thread', async () => {
		await demoSource.sendMessage('c-tunde', 'u-tunde', 'Reply while the thread is open');
		const unread = async () =>
			(await demoSource.getConversations('u-ada')).find((c) => c.id === 'c-tunde')!.unread;
		expect(await unread()).toBe(1);

		// Only the receiver opening the thread clears it.
		await demoSource.markConversationRead('c-tunde', 'u-ada');
		expect(await unread()).toBe(0);

		// Somebody else opening/ acknowledging never touches this inbox.
		await demoSource.sendMessage('c-tunde', 'u-tunde', 'Another reply');
		await demoSource.markConversationRead('c-tunde', 'u-tunde');
		expect(await unread()).toBe(1);
	});

	it('never clears the other participant’s counter', async () => {
		const event = (await demoSource.listEvents()).find((item) => item.organizer.id !== 'u-ada')!;
		const request = await demoSource.createMessageRequest('u-ada', event.slug, 'Opening question about the fair');
		const accepted = await demoSource.respondToMessageRequest(event.organizer.id, request.id, true);
		const id = accepted.conversationId!;

		const organizerUnread = async () =>
			(await demoSource.getConversations(event.organizer.id)).find((c) => c.id === id)!.unread;
		const requesterUnread = async () =>
			(await demoSource.getConversations('u-ada')).find((c) => c.id === id)!.unread;

		// The recipient (organizer) has not opened the thread yet.
		expect(await organizerUnread()).toBe(1);
		expect(await requesterUnread()).toBe(0);

		// The sender opening their own side must not mark the receiver's copy read.
		await demoSource.markConversationRead(id, 'u-ada');
		expect(await organizerUnread()).toBe(1);

		// The receiver opening the thread clears their own counter.
		await demoSource.markConversationRead(id, event.organizer.id);
		expect(await organizerUnread()).toBe(0);

		// A reply arrives for the requester; the organizer opening (or sending)
		// must not clear the requester's count.
		await demoSource.sendMessage(id, event.organizer.id, 'See you at the gate');
		expect(await requesterUnread()).toBe(1);
		await demoSource.markConversationRead(id, event.organizer.id);
		expect(await requesterUnread()).toBe(1);

		// Only the requester opening the thread clears it.
		await demoSource.markConversationRead(id, 'u-ada');
		expect(await requesterUnread()).toBe(0);
	});
});

describe('Supabase read state is per participant', () => {
	const me = '11111111-1111-4111-8111-111111111111';
	const peer = '22222222-2222-4222-8222-222222222222';
	const stranger = '33333333-3333-4333-8333-333333333333';
	const row = {
		id: '44444444-4444-4444-8444-444444444444',
		user_id: me,
		peer_id: peer,
		last_message: 'hello',
		last_at: at,
		unread: 3,
		peer_unread: 7,
		event_id: null,
		user: { id: me, handle: 'me', name: 'Me' },
		peer: { id: peer, handle: 'peer', name: 'Peer' }
	};

	it('reports the signed-in participant’s own counter', async () => {
		const chain = {
			select: vi.fn().mockReturnThis(),
			or: vi.fn().mockResolvedValue({ data: [row], error: null })
		};
		const from = vi.fn(() => chain);
		const source = supabaseSource({ from } as unknown as SupabaseClient);

		expect((await source.getConversations(me))[0].unread).toBe(3);
		expect((await source.getConversations(peer))[0].unread).toBe(7);
	});

	it('clears only the reader’s column and ignores non-participants', async () => {
		const build = (viewer: string) => {
			const chain = {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
				update: vi.fn().mockReturnThis(),
				then: (fn: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(fn)
			};
			const from = vi.fn(() => chain);
			return { chain, source: supabaseSource({ from } as unknown as SupabaseClient), viewer };
		};

		const owner = build(me);
		await owner.source.markConversationRead(row.id, me);
		expect(owner.chain.update).toHaveBeenCalledWith({ unread: 0 });
		expect(owner.chain.update).not.toHaveBeenCalledWith({ peer_unread: 0 });

		const recipient = build(peer);
		await recipient.source.markConversationRead(row.id, peer);
		expect(recipient.chain.update).toHaveBeenCalledWith({ peer_unread: 0 });
		expect(recipient.chain.update).not.toHaveBeenCalledWith({ unread: 0 });

		const outsider = build(stranger);
		await outsider.source.markConversationRead(row.id, stranger);
		expect(outsider.chain.update).not.toHaveBeenCalled();
	});
});

describe('read endpoint', () => {
	it('returns the receiver’s post-acknowledgement thread list', async () => {
		const response = await acknowledgeThread({
			params: { id: 'c-amina' },
			locals: { session: { userId: 'u-ada' } },
			cookies
		} as never);
		const payload = await response.json();

		expect(payload.ok).toBe(true);
		expect(Array.isArray(payload.conversations)).toBe(true);
		expect(payload.conversations.find((c: Conversation) => c.id === 'c-amina')?.unread).toBe(0);
	});

	it('rejects signed-out readers', async () => {
		const response = await acknowledgeThread({
			params: { id: 'c-amina' },
			locals: { session: null },
			cookies
		} as never);
		expect(response.status).toBe(401);
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventItem, ProfileSnapshot, Ticket } from '$lib/types';
import { queryClient } from '$lib/query/cache';
import { load as homeLoad } from '../../src/routes/(app)/home/+page';
import { load as exploreLoad } from '../../src/routes/(app)/explore/+page';
import { load as ticketsLoad } from '../../src/routes/(app)/tickets/+page';
import { load as eventDetailLoad } from '../../src/routes/(app)/events/[slug]/+page';
import { load as threadLoad } from '../../src/routes/(app)/inbox/[id]/+page';
import { load as ticketDetailLoad } from '../../src/routes/(app)/tickets/[id]/+page';
import { load as userProfileLoad } from '../../src/routes/(app)/users/[handle]/+page';
import { markDataChanged } from '$lib/query/mutation';

/**
 * Route navigations must read the query cache rather than rebuild the payload
 * from the server. These are the loads SvelteKit re-runs on every tab switch.
 */

const at = '2026-11-20T18:00:00.000Z';
function event(id: string, category: EventItem['category'] = 'music'): EventItem {
	return {
		id,
		status: 'published',
		slug: id,
		title: `Event ${id}`,
		category,
		tags: [],
		startsAt: at,
		venue: 'Venue',
		city: 'Lagos',
		cover: { from: '#000', to: '#111', icon: 'music' },
		description: '',
		organizer: { id: 'u-org', handle: 'org', name: 'Org', avatarColor: '#123', followers: 0, following: 0 },
		speakers: [],
		agenda: [],
		tiers: [{ id: 't1', name: 'General', price: 1000, sold: 0, capacity: 10 }],
		faqs: [],
		policies: [],
		viewsToday: 1,
		attendees: 0
	};
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200 });
}

describe('cache-aware route loads', () => {
	it('home serves a warm catalogue without touching the network', async () => {
		const fetchMock = vi.fn(async () => jsonResponse([event('a'), event('b', 'tech')]));
		const first = (await homeLoad({ fetch: fetchMock } as never)) as { events: EventItem[] };
		expect(first.events).toHaveLength(2);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/events');

		const second = (await homeLoad({ fetch: fetchMock } as never)) as { events: EventItem[] };
		expect(second.events).toHaveLength(2);
		// A tab switch re-runs the load; the fresh cache answers it.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('home refetches after its key is invalidated (mutation)', async () => {
		const fetchMock = vi.fn(async () => jsonResponse([event('a')]));
		await homeLoad({ fetch: fetchMock } as never);
		queryClient.invalidate('events:');
		await homeLoad({ fetch: fetchMock } as never);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('explore filters a cached catalogue when the query changes', async () => {
		const fetchMock = vi.fn(async () => jsonResponse([event('a', 'music'), event('b', 'tech')]));

		const music = (await exploreLoad({
			fetch: fetchMock,
			url: new URL('http://localhost/explore?category=music')
		} as never)) as { events: EventItem[]; allEvents: EventItem[] };
		expect(music.events.map((e) => e.id)).toEqual(['a']);
		expect(music.allEvents).toHaveLength(2);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const tech = (await exploreLoad({
			fetch: fetchMock,
			url: new URL('http://localhost/explore?category=tech')
		} as never)) as { events: EventItem[] };
		expect(tech.events.map((e) => e.id)).toEqual(['b']);
		// Changing filters re-uses the cached catalogue.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('explore reads the catalogue in bounded pages when the cache is cold', async () => {
		const many = Array.from({ length: 60 }, (_, index) => event(`e${index}`));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			return jsonResponse(url.includes('offset=0') ? many : []);
		});
		const result = (await exploreLoad({
			fetch: fetchMock,
			url: new URL('http://localhost/explore')
		} as never)) as { allEvents: EventItem[] };
		expect(result.allEvents).toHaveLength(60);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[0][0])).toContain('limit=60');
	});

	it('tickets performs no request for a guest', async () => {
		const fetchMock = vi.fn();
		const result = await ticketsLoad({
			fetch: fetchMock,
			parent: async () => ({ session: null })
		} as never);
		expect(result).toEqual({ tickets: [], approvals: [], session: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('tickets loads once for a member and then serves the cache', async () => {
		const session = { userId: 'u-1', email: 'a@b.c', handle: 'a', name: 'A', role: 'attendee' as const };
		const ticket = { id: 'tk1', status: 'valid', eventTitle: 'Event' };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/tickets') return jsonResponse([ticket]);
			return jsonResponse([]);
		});
		const args = { fetch: fetchMock, parent: async () => ({ session }) } as never;
		const first = (await ticketsLoad(args)) as { tickets: Ticket[]; session: typeof session };
		expect(first.tickets).toHaveLength(1);
		expect(first.session.userId).toBe('u-1');
		const calls = fetchMock.mock.calls.length;

		await ticketsLoad(args);
		expect(fetchMock.mock.calls.length).toBe(calls);
	});

	it('profile snapshot is cached as one key', async () => {
		const { load: profileLoad } = await import('../../src/routes/(app)/profile/+page');
		const snapshot: ProfileSnapshot = {
			session: null,
			demoMode: true,
			tickets: [],
			profile: null,
			events: [event('a')]
		};
		const fetchMock = vi.fn(async () => jsonResponse(snapshot));
		const first = (await profileLoad({ fetch: fetchMock, parent: async () => ({}) } as never)) as ProfileSnapshot;
		expect(first.events).toHaveLength(1);
		await profileLoad({ fetch: fetchMock, parent: async () => ({}) } as never);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refetches a warm entry after a mutation marks the data changed', async () => {
		const fetchMock = vi.fn(async () => jsonResponse([event('a')]));
		await homeLoad({ fetch: fetchMock } as never);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// What every successful `use:enhance` submission does. The clock has
		// millisecond resolution, and a real action is a round trip away, so
		// step past the entry's timestamp before marking.
		await new Promise((resolve) => setTimeout(resolve, 2));
		markDataChanged();

		await homeLoad({ fetch: fetchMock } as never);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('cache-aware detail loads', () => {
	const session = { userId: 'u-1', email: 'a@b.c', handle: 'ada', name: 'Ada', role: 'attendee' as const };
	const detailFetch = vi.fn();
	beforeEach(() => {
		detailFetch.mockReset();
		detailFetch.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/message-request')) return jsonResponse({ request: null });
			if (url === '/api/events/a') return jsonResponse(event('a'));
			if (url === '/api/conversations/c1') return jsonResponse({ id: 'c1', peer: { id: 'u-2' } });
			if (url === '/api/conversations/c1/messages') return jsonResponse([{ id: 'm1', body: 'hi' }]);
			if (url === '/api/conversations') return jsonResponse([{ id: 'c1' }]);
			if (url === '/api/tickets') return jsonResponse([{ id: 'tk1', status: 'valid', eventTitle: 'Event' }]);
			if (url === '/api/approvals') return jsonResponse([]);
			if (url === '/api/users/ada') return jsonResponse({ profile: { id: 'u-1', handle: 'ada' }, events: [event('a')] });
			return jsonResponse([]);
		});
	});

	const eventArgs = { fetch: detailFetch, parent: async () => ({ session }) };

	it('event detail answers from the cache, per-user state included but separate', async () => {
		const first = (await eventDetailLoad({ ...eventArgs, params: { slug: 'a' } } as never)) as {
			event: EventItem;
			messageRequest: unknown;
		};
		expect(first.event.id).toBe('a');
		expect(first.messageRequest).toBeNull();
		const calls = detailFetch.mock.calls.length;
		expect(calls).toBe(2);

		await eventDetailLoad({ ...eventArgs, params: { slug: 'a' } } as never);
		expect(detailFetch.mock.calls.length).toBe(calls);
	});

	it('event detail 404s instead of rendering a missing event', async () => {
		await expect(
			eventDetailLoad({
				fetch: async () => new Response('{}', { status: 404 }),
				parent: async () => ({ session: null }),
				params: { slug: 'gone' }
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('a thread reuses both the conversation and the messages caches', async () => {
		const args = { fetch: detailFetch, params: { id: 'c1' } } as never;
		const first = (await threadLoad(args)) as { conversation: { id: string }; messages: unknown[] };
		expect(first.conversation.id).toBe('c1');
		expect(first.messages).toHaveLength(1);
		const calls = detailFetch.mock.calls.length;

		await threadLoad(args);
		expect(detailFetch.mock.calls.length).toBe(calls);
	});

	it('ticket detail serves the vault cache and 404s for guests', async () => {
		const args = { fetch: detailFetch, parent: async () => ({ session }), params: { id: 'tk1' } } as never;
		const first = (await ticketDetailLoad(args)) as { ticket: { id: string } };
		expect(first.ticket.id).toBe('tk1');
		const calls = detailFetch.mock.calls.length;

		await ticketDetailLoad(args);
		expect(detailFetch.mock.calls.length).toBe(calls);

		await expect(
			ticketDetailLoad({ fetch: detailFetch, parent: async () => ({ session: null }), params: { id: 'tk1' } } as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('a public profile is cached by handle', async () => {
		const args = { fetch: detailFetch, params: { handle: 'ada' } } as never;
		const first = (await userProfileLoad(args)) as { profile: { handle: string }; events: EventItem[] };
		expect(first.profile.handle).toBe('ada');
		expect(first.events).toHaveLength(1);
		const calls = detailFetch.mock.calls.length;

		await userProfileLoad(args);
		expect(detailFetch.mock.calls.length).toBe(calls);
	});
});

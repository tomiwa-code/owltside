import { describe, expect, it, vi } from 'vitest';
import type { EventItem, ProfileSnapshot, Ticket } from '$lib/types';
import { queryClient } from '$lib/query/cache';
import { load as homeLoad } from '../../src/routes/(app)/home/+page';
import { load as exploreLoad } from '../../src/routes/(app)/explore/+page';
import { load as ticketsLoad } from '../../src/routes/(app)/tickets/+page';

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
});

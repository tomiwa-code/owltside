import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach } from 'vitest';

const source = vi.hoisted(() => ({ getOrganizer: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null }));
vi.mock('$lib/server/datasource', () => ({ getSource: () => source }));

import { load } from '../../src/routes/(app)/organizer/scan/+page.server';
import ScanPage from '../../src/routes/(app)/organizer/scan/+page.svelte';
import OrganizerPage from '../../src/routes/(app)/organizer/+page.svelte';
import type { EventItem } from '$lib/types';

const stats = {
	revenue: 0,
	revenueDeltaPct: 0,
	checkedIn: 0,
	capacity: 0,
	orders: 0,
	soldPct: 0,
	soldLastHour: 0,
	payout: 0
};

const gatedEvent = {
	id: 'e-rooftop',
	slug: 'yaba-rooftop-sessions',
	title: 'Yaba Rooftop Sessions',
	startsAt: new Date().toISOString(),
	venue: 'Rooftop @44',
	city: 'Lagos',
	tiers: [{ id: 'tier-gen', name: 'General', price: 12_000, sold: 3, capacity: 10 }],
	gates: [{ id: 'gate-0', name: 'Gate 1', modes: ['QR'], staff: [] }]
} as unknown as EventItem;

type ScanLoad = { organizer: { events: EventItem[] }; initialEventId: string };

const loadPage = () =>
	load({
		locals: { session: { userId: 'u-ada', role: 'organizer' } },
		cookies: { get: () => '' },
		url: new URL('http://localhost/organizer/scan')
	} as never) as Promise<ScanLoad>;

/** Layout data every (app) route receives. */
const layoutData = {
	session: { userId: 'u-ada', email: 'ada@owltside.app', handle: 'adaobi', name: 'Ada Obi', role: 'organizer' as const },
	demoMode: true,
	operatingIdentity: 'organizer' as const,
	currentProfile: null,
	followingIds: [],
	unread: 0,
	inboxUnread: 0,
	followLoadError: false
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('gate scanner readiness', () => {
	it('stays open instead of redirecting when no event exists yet', async () => {
		source.getOrganizer.mockResolvedValue({ events: [], stats, checkins: [], orders: [] });

		const result = await loadPage();

		expect(result.organizer.events).toEqual([]);
		expect(result.initialEventId).toBe('');
	});

	it('prefers the requested event, then an event that has a gate configured', async () => {
		const withoutGate = { id: 'e-plain', title: 'Plain Event', gates: [] } as unknown as EventItem;
		source.getOrganizer.mockResolvedValue({
			events: [withoutGate, gatedEvent],
			stats,
			checkins: [],
			orders: []
		});

		expect((await loadPage()).initialEventId).toBe('e-rooftop');

		const requested = (await load({
			locals: { session: { userId: 'u-ada', role: 'organizer' } },
			cookies: { get: () => '' },
			url: new URL('http://localhost/organizer/scan?eventId=e-plain')
		} as never)) as ScanLoad;
		expect(requested.initialEventId).toBe('e-plain');
	});

	it('guides the organizer to set a gate up when there is no event', () => {
		render(ScanPage, {
			props: {
				data: { ...layoutData, organizer: { events: [], stats, checkins: [], orders: [] }, initialEventId: '' }
			}
		});

		expect(screen.getAllByText(/No event to scan yet/i).length).toBeGreaterThan(0);
		const createEvent = screen.getAllByRole('link', { name: /Create event/i });
		expect(createEvent.length).toBeGreaterThan(0);
		expect(createEvent[0].getAttribute('href')).toBe('/organizer/create');
	});

	it('asks for a gate when the event has none configured yet', () => {
		render(ScanPage, {
			props: {
				data: {
					...layoutData,
					organizer: {
						events: [{ id: 'e-plain', title: 'Plain Event', gates: [] } as unknown as EventItem],
						stats,
						checkins: [],
						orders: []
					},
					initialEventId: 'e-plain'
				}
			}
		});

		expect(screen.getAllByText(/no gate yet/i).length).toBeGreaterThan(0);
		const configure = screen.getAllByRole('link', { name: /Configure gates/i });
		expect(configure[0].getAttribute('href')).toBe('/organizer/create?edit=e-plain');
	});

	it('arms the scanner for an event that already has a gate', () => {
		render(ScanPage, {
			props: {
				data: {
					...layoutData,
					organizer: { events: [gatedEvent], stats, checkins: [], orders: [] },
					initialEventId: 'e-rooftop'
				}
			}
		});

		expect(screen.getAllByText(/Verify Security Token/i).length).toBeGreaterThan(0);
		expect(screen.queryByText(/No event to scan yet/i)).toBeNull();
	});

	it('keeps the dashboard scanner entry point usable before any event exists', () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ events: [], stats, checkins: [], orders: [] })))
		);

		render(OrganizerPage, {
			props: { data: { ...layoutData, payload: { events: [], stats, checkins: [], orders: [] } } }
		});

		const scannerLinks = screen.getAllByRole('link', { name: /Open Ticket Scanner/i });
		expect(scannerLinks.length).toBeGreaterThan(0);
		expect(scannerLinks[0].getAttribute('href')).toBe('/organizer/scan');

		const desktopLink = screen.getAllByRole('link', { name: /Open Camera QR Scanner/i });
		expect(desktopLink.length).toBeGreaterThan(0);
		expect(desktopLink[0].getAttribute('href')).toBe('/organizer/scan');

		vi.unstubAllGlobals();
	});

	it('points the dashboard scanner entry point at the event that has a gate', () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ events: [gatedEvent], stats, checkins: [], orders: [] })))
		);

		render(OrganizerPage, {
			props: { data: { ...layoutData, payload: { events: [gatedEvent], stats, checkins: [], orders: [] } } }
		});

		const scannerLinks = screen.getAllByRole('link', { name: /Open Ticket Scanner/i });
		expect(scannerLinks[0].getAttribute('href')).toBe('/organizer/scan?eventId=e-rooftop');

		vi.unstubAllGlobals();
	});
});

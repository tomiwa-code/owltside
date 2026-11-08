import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import SplashPage from '../../src/routes/+page.svelte';
import EventPage from '../../src/routes/(app)/events/[slug]/+page.svelte';
import HomePage from '../../src/routes/(app)/home/+page.svelte';
import { events as demoEvents, people } from '$lib/server/demo/seed';
import { buildDirectionsUrl, buildMapEmbedUrl, formatMapQuery, isAppleMobileNavigator } from '$lib/utils/maps';
import {
	detectHeaderLocation,
	resolveNearestLocation,
	resolveUserLocation,
	selectVerifiedOrganizers
} from '$lib/utils/organizers';

const mocks = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', async (original) => ({
	...(await original<typeof import('$app/navigation')>()),
	goto: mocks.goto
}));

const session = {
	userId: '11111111-1111-4111-8111-111111111111',
	email: 'ada@example.test',
	handle: 'adaobi',
	name: 'Ada Obi',
	role: 'attendee' as const,
	avatarUrl: null
};

const layoutData = {
	session: null,
	demoMode: true,
	operatingIdentity: 'attendee' as const,
	unread: 0,
	inboxUnread: 0,
	currentProfile: null,
	detectedLocation: undefined as string | undefined,
	followingIds: [] as string[],
	followLoadError: false
};

beforeEach(() => {
	mocks.goto.mockReset();
	Object.assign(page.data, layoutData);
	page.url = new URL('https://owltside.example/') as typeof page.url;
	vi.stubGlobal(
		'matchMedia',
		vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		}))
	);
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete (navigator as { geolocation?: unknown }).geolocation;
	Object.assign(page.data, layoutData);
});

describe('splash loading progress', () => {
	it('animates the loading bar from 0% to 100% before navigating to the homepage when signed in', async () => {
		vi.useFakeTimers();
		page.data.session = session;
		render(SplashPage);
		await tick();

		const bar = screen.getByRole('progressbar', { name: 'Loading Owltside' });
		expect(bar).toHaveAttribute('aria-valuenow', '0');
		expect(screen.getByText('0%')).toBeInTheDocument();
		expect(mocks.goto).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(180);
		const midProgress = Number(bar.getAttribute('aria-valuenow'));
		expect(midProgress).toBeGreaterThan(0);
		expect(midProgress).toBeLessThan(100);
		expect(mocks.goto).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(4_000);
		expect(bar).toHaveAttribute('aria-valuenow', '100');
		expect(screen.getByText('100%')).toBeInTheDocument();
		expect(mocks.goto).toHaveBeenCalledWith('/home', { replaceState: true });
	});
});

describe('venue map and directions', () => {
	it('formats map queries, embed URLs, and platform-specific directions links', () => {
		expect(formatMapQuery('Monarch event center', 'Lagos')).toBe('Monarch event center, Lagos');
		expect(formatMapQuery('Monarch event center, Lagos', 'Lagos')).toBe('Monarch event center, Lagos');

		const embedUrl = buildMapEmbedUrl('Monarch event center', 'Lagos');
		expect(embedUrl).toBe(
			'https://maps.google.com/maps?q=Monarch%20event%20center%2C%20Lagos&t=&z=15&ie=UTF8&iwloc=&output=embed'
		);

		const iphoneNav = {
			userAgent:
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
			maxTouchPoints: 5
		};
		expect(isAppleMobileNavigator(iphoneNav)).toBe(true);
		expect(buildDirectionsUrl('Monarch event center', 'Lagos', iphoneNav)).toBe(
			'https://maps.apple.com/?daddr=Monarch%20event%20center%2C%20Lagos&dirflg=d'
		);

		const androidNav = {
			userAgent:
				'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
			maxTouchPoints: 5
		};
		expect(isAppleMobileNavigator(androidNav)).toBe(false);
		expect(buildDirectionsUrl('Monarch event center', 'Lagos', androidNav)).toBe(
			'https://www.google.com/maps/dir/?api=1&destination=Monarch%20event%20center%2C%20Lagos'
		);
	});

	it('renders the location map iframe without the bottom location overlay bar, links Directions to the phone map app, and removes Indoor Nav', () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
		);
		const event = {
			...demoEvents[0],
			venue: 'Monarch event center',
			city: 'Lagos'
		};

		render(EventPage, {
			props: {
				data: {
					...layoutData,
					event,
					messageRequest: null
				}
			}
		});

		const maps = screen.getAllByTitle('Map of Monarch event center, Lagos');
		expect(maps.length).toBeGreaterThanOrEqual(2);
		for (const mapFrame of maps) {
			expect(mapFrame.tagName).toBe('IFRAME');
			expect(mapFrame).toHaveAttribute(
				'src',
				'https://maps.google.com/maps?q=Monarch%20event%20center%2C%20Lagos&t=&z=15&ie=UTF8&iwloc=&output=embed'
			);
		}

		// The mobile map container only has the iframe (no floating bottom location bar)
		const mobileMapContainer = maps[maps.length - 1].parentElement!;
		expect(mobileMapContainer.children).toHaveLength(1);
		expect(mobileMapContainer.textContent?.trim()).toBe('');

		const directionsLinks = screen.getAllByRole('link', { name: /Directions/i });
		expect(directionsLinks.length).toBeGreaterThanOrEqual(2);
		for (const link of directionsLinks) {
			expect(link).toHaveAttribute(
				'href',
				'https://maps.apple.com/?daddr=Monarch%20event%20center%2C%20Lagos&dirflg=d'
			);
		}

		expect(screen.queryByText(/Indoor Nav/i)).not.toBeInTheDocument();
	});
});

describe('verified organizers and user location', () => {
	it('selects at most 5 verified organizers randomly and prioritizes the user location', () => {
		const manyEvents = Array.from({ length: 8 }, (_, idx) => ({
			...demoEvents[0],
			id: `ev-${idx}`,
			slug: `ev-${idx}`,
			city: idx < 6 ? 'Abuja' : 'Lagos',
			organizer: {
				...people.segun,
				id: `org-${idx}`,
				handle: `org_${idx}`,
				name: `Organizer ${idx}`,
				city: idx < 6 ? 'Abuja' : 'Lagos',
				verified: true
			}
		}));

		const pickA = selectVerifiedOrganizers(manyEvents, 'Abuja', 5, () => 0.15);
		const pickB = selectVerifiedOrganizers(manyEvents, 'Abuja', 5, () => 0.85);

		expect(pickA).toHaveLength(5);
		expect(pickB).toHaveLength(5);
		expect(pickA.every((org) => org.city === 'Abuja')).toBe(true);
		expect(pickA.map((org) => org.id)).not.toEqual(pickB.map((org) => org.id));
	});

	it('resolves the user location from geolocation, profile, and request headers and displays it in Verified Organizers', async () => {
		expect(resolveNearestLocation(9.0765, 7.3986)).toBe('Abuja');
		expect(resolveNearestLocation(4.8156, 7.0498)).toBe('Rivers');
		expect(
			detectHeaderLocation(new Headers({ 'x-vercel-ip-city': 'Port%20Harcourt' }))
		).toBe('Port Harcourt');
		expect(
			resolveUserLocation({
				geoCity: null,
				draftCity: null,
				profileCity: 'Abuja',
				detectedCity: 'Lagos'
			})
		).toBe('Abuja');

		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				getCurrentPosition: (success: (pos: { coords: { latitude: number; longitude: number } }) => void) => {
					success({ coords: { latitude: 9.0765, longitude: 7.3986 } });
				}
			}
		});

		render(HomePage, {
			props: {
				data: {
					...layoutData,
					events: demoEvents
				}
			}
		});
		await tick();

		expect(screen.getAllByText('Abuja').length).toBeGreaterThanOrEqual(2);
	});
});

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const source = vi.hoisted(() => ({ getOrganizer: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null }));
vi.mock('$lib/server/datasource', () => ({ getSource: () => source }));

import ScanPage from '../../src/routes/(app)/organizer/scan/+page.svelte';
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

function renderScanner(events: EventItem[] = [gatedEvent], initialEventId = 'e-rooftop') {
	return render(ScanPage, {
		props: {
			data: {
				...layoutData,
				organizer: { events, stats, checkins: [], orders: [] },
				initialEventId
			}
		}
	});
}

async function armScanner() {
	// The console renders a desktop and a mobile PIN pad; the first six cells
	// are the desktop ones and both pads share the same PIN state.
	const cells = screen.getAllByLabelText(/^Digit \d$/);
	for (let index = 0; index < 6; index++) {
		await fireEvent.input(cells[index], { target: { value: String(index + 1) } });
	}
	await fireEvent.click(screen.getAllByRole('button', { name: /Arm scanner/i })[0]);
	await waitFor(() => expect(screen.getAllByRole('button', { name: /Start camera/i }).length).toBeGreaterThan(0));
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('scanner camera', () => {
	it('opens the phone camera and keeps the preview running', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
		);
		const stream = {
			getTracks: () => [{ stop: vi.fn() }],
			getVideoTracks: () => []
		} as unknown as MediaStream;
		const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true,
			writable: true
		});
		// jsdom never renders media, so pretend the preview is running.
		Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
			value: false,
			configurable: true
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

		renderScanner();
		await armScanner();

		await fireEvent.click(screen.getAllByRole('button', { name: /Start camera/i })[0]);

		await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
		const constraints = getUserMedia.mock.calls[0][0];
		expect(JSON.stringify(constraints)).toMatch(/environment/);

		await waitFor(() => {
			const videos = Array.from(document.querySelectorAll('video'));
			expect(videos.some((video) => video.srcObject === stream)).toBe(true);
		});
		expect(screen.getAllByText(/Camera live/i).length).toBeGreaterThan(0);
	});

	it('runs the same PIN → camera flow when no event exists yet', async () => {
		const authorize = vi.fn(
			async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 })
		);
		vi.stubGlobal('fetch', authorize);
		const stream = {
			getTracks: () => [{ stop: vi.fn() }],
			getVideoTracks: () => []
		} as unknown as MediaStream;
		const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true,
			writable: true
		});
		Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
			value: false,
			configurable: true
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

		renderScanner([], '');
		await armScanner();
		expect(authorize).toHaveBeenCalledWith('/api/scan/authorize', expect.anything());
		// Standalone arming sends only the PIN — no event or gate to name.
		const sent = JSON.parse(String(authorize.mock.calls[0][1]?.body ?? '{}')) as Record<string, unknown>;
		expect(sent).toEqual({ code: '123456' });

		await fireEvent.click(screen.getAllByRole('button', { name: /Start camera/i })[0]);

		await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
		await waitFor(() => {
			const videos = Array.from(document.querySelectorAll('video'));
			expect(videos.some((video) => video.srcObject === stream)).toBe(true);
		});
		expect(screen.getAllByText(/Camera live/i).length).toBeGreaterThan(0);
		// Manual entry is there too, exactly like the gated flow.
		expect(screen.getAllByPlaceholderText(/EV-XXXX/i).length).toBeGreaterThan(0);
	});

	it('switches to the organizers event when a helper enters a shared gate PIN', async () => {
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (String(url).includes('/api/scan/authorize')) {
				return new Response(
					JSON.stringify({
						authorized: true,
						context: { mode: 'shared-gate', eventId: 'e-owner', gate: 'Main Gate', eventTitle: 'Owner Event' }
					}),
					{ status: 200 }
				);
			}
			return new Response(
				JSON.stringify({
					id: 'ck-shared',
					eventId: 'e-owner',
					ticketCode: 'EV-SHARED-0001',
					holder: 'Guest',
					tier: 'General',
					gate: 'Main Gate',
					at: new Date().toISOString(),
					result: 'verified'
				}),
				{ status: 200 }
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		// The helper has no events of their own.
		renderScanner([], '');
		await armScanner();

		expect(screen.getAllByText(/Owner Event/i).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/Main Gate/i).length).toBeGreaterThan(0);

		const manual = screen.getAllByPlaceholderText(/EV-XXXX/i)[0];
		await fireEvent.input(manual, { target: { value: 'EV-SHARED-0001' } });
		await fireEvent.click(screen.getAllByRole('button', { name: /^Verify$/i })[0]);

		await waitFor(() => {
			const scanCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/scan');
			expect(scanCall).toBeDefined();
			const sent = JSON.parse(String(scanCall?.[1]?.body ?? '{}')) as Record<string, unknown>;
			expect(sent).toMatchObject({
				eventId: 'e-owner',
				gate: 'Main Gate',
				code: 'EV-SHARED-0001',
				staffToken: '123456'
			});
		});
		await waitFor(() => expect(screen.getAllByText(/verified/i).length).toBeGreaterThan(0));

		const confirmation = await screen.findByRole('button', { name: /Ticket verified for Guest/i });
		expect(confirmation).toHaveTextContent('Ticket Verified');
		expect(confirmation).toHaveTextContent('Admit entry · Main Gate');
		await fireEvent.click(confirmation);
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: /Ticket verified for Guest/i })).toBeNull()
		);
	});

	it('explains a blocked camera instead of leaving a black screen', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
		);
		Object.defineProperty(navigator, 'mediaDevices', {
			value: {
				getUserMedia: vi
					.fn()
					.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
			},
			configurable: true,
			writable: true
		});

		renderScanner();
		await armScanner();

		await fireEvent.click(screen.getAllByRole('button', { name: /Start camera/i })[0]);

		await waitFor(() =>
			expect(screen.getAllByText(/Camera access was blocked/i).length).toBeGreaterThan(0)
		);
		// The manual fallback stays available.
		expect(screen.getAllByPlaceholderText(/EV-XXXX/i).length).toBeGreaterThan(0);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { page } from '$app/state';
import { appSettings } from '$lib/state/settings.svelte';
import { queryClient } from '$lib/state/query.svelte';
import { computeOrganizer, demoSource, supabaseSource } from '$lib/server/datasource';
import * as demo from '$lib/server/demo/seed';
import {
	eventPayoutButtonState,
	isEventClosed,
	resolveEventPayoutRequest
} from '$lib/utils/event-status';
import OrganizerPage from '../../src/routes/(app)/organizer/+page.svelte';
import ManageEventPage from '../../src/routes/(app)/organizer/events/[id]/+page.svelte';
import { load as createWizardLoad, actions as createWizardActions } from '../../src/routes/(app)/organizer/create/+page.server';
import { actions as manageEventActions } from '../../src/routes/(app)/organizer/events/[id]/+page.server';
import type { ApprovalRequest, EventItem } from '$lib/types';

const EMPTY_PAYOUT = { bank: '', accountNumber: '' };

const baseData = {
	unread: 0,
	inboxUnread: 0,
	operatingIdentity: 'organizer' as const,
	session: {
		userId: 'u-org',
		email: 'org@owltside.com',
		name: 'Ada Obi',
		handle: 'adaobi',
		role: 'organizer' as const
	},
	demoMode: true,
	currentProfile: null,
	followingIds: [] as string[],
	followLoadError: false
};

const makeEvent = (overrides: {
	id: string;
	slug: string;
	title: string;
	startsAt: string;
	endsAt: string;
	status?: EventItem['status'];
	sold?: number;
	price?: number;
}): EventItem =>
	({
		id: overrides.id,
		slug: overrides.slug,
		title: overrides.title,
		description: 'Production event.',
		category: 'music',
		tags: ['Music'],
		startsAt: overrides.startsAt,
		endsAt: overrides.endsAt,
		venue: 'Landmark Hall',
		city: 'Lagos',
		cover: { from: '#1e1b4b', to: '#4c1d95', icon: 'music' },
		organizer: { id: 'u-org', name: 'Ada Obi', handle: 'adaobi', verified: true },
		tiers: [
			{
				id: `tier-${overrides.id}`,
				name: 'General',
				price: overrides.price ?? 10_000,
				capacity: 100,
				sold: overrides.sold ?? 40
			}
		],
		agenda: [],
		speakers: [],
		attendees: overrides.sold ?? 40,
		gates: [{ id: 'g-1', name: 'Main Gate', modes: ['QR'], staff: ['Staff 1'] }],
		promos: [],
		status: overrides.status ?? 'published'
	}) as unknown as EventItem;

describe('payout button state machine & resolution helpers', () => {
	const futureEvent = makeEvent({
		id: 'ev-future',
		slug: 'future-fest',
		title: 'Future Fest',
		startsAt: '2026-12-10T18:00:00+01:00',
		endsAt: '2026-12-10T23:00:00+01:00',
		status: 'published'
	});
	const closedEvent = makeEvent({
		id: 'ev-closed',
		slug: 'closed-fest',
		title: 'Closed Fest',
		startsAt: '2026-10-01T18:00:00+01:00',
		endsAt: '2026-10-01T23:00:00+01:00',
		status: 'closed'
	});

	it('disables Request Payout before event closes and enables it once closed', () => {
		expect(isEventClosed(futureEvent)).toBe(false);
		expect(eventPayoutButtonState(futureEvent, null)).toEqual({
			state: 'locked',
			label: 'Request Payout',
			disabled: true
		});

		expect(isEventClosed(closedEvent)).toBe(true);
		expect(eventPayoutButtonState(closedEvent, null)).toEqual({
			state: 'available',
			label: 'Request Payout',
			disabled: false
		});
	});

	it('transitions through Payout Requested, Approved (permanently locked), and Denied', () => {
		const pending: ApprovalRequest = {
			id: 'ap-1',
			kind: 'payout',
			status: 'pending',
			requesterId: 'u-org',
			title: 'Payout request · Closed Fest',
			summary: 'Requested',
			amount: 140_000,
			subjectId: 'ev-closed',
			createdAt: '2026-10-31T10:00:00Z'
		};
		expect(eventPayoutButtonState(closedEvent, pending)).toEqual({
			state: 'requested',
			label: 'Payout Requested',
			disabled: true
		});

		const approved: ApprovalRequest = { ...pending, status: 'approved' };
		expect(eventPayoutButtonState(closedEvent, approved)).toEqual({
			state: 'approved',
			label: 'Approved',
			disabled: true
		});

		const denied: ApprovalRequest = { ...pending, status: 'rejected', note: 'Account mismatch' };
		expect(eventPayoutButtonState(closedEvent, denied)).toEqual({
			state: 'denied',
			label: 'Denied',
			disabled: false
		});

		// Once any request for an event is approved, resolveEventPayoutRequest always returns approved.
		expect(resolveEventPayoutRequest([denied, approved], 'ev-closed')?.status).toBe('approved');
	});
});

describe('Organizer dashboard payout lifecycle & Past tab', () => {
	const activeEvent = makeEvent({
		id: 'ev-active-1',
		slug: 'upcoming-rooftop',
		title: 'Upcoming Rooftop Live',
		startsAt: '2026-12-15T19:00:00+01:00',
		endsAt: '2026-12-15T23:30:00+01:00',
		status: 'published',
		sold: 50,
		price: 10_000
	});

	const pastEventA = makeEvent({
		id: 'ev-past-a',
		slug: 'october-jazz-night',
		title: 'October Jazz Night',
		startsAt: '2026-10-10T18:00:00+01:00',
		endsAt: '2026-10-10T22:00:00+01:00',
		status: 'closed',
		sold: 60,
		price: 10_000
	});

	beforeEach(() => {
		queryClient.invalidate('');
		vi.stubGlobal('scrollTo', vi.fn());
		(page as unknown as { url: URL }).url = new URL('http://localhost/organizer');
		(page as unknown as { data: Record<string, unknown> }).data = { ...baseData };
		appSettings.value.verification.payoutAccount = true;
		appSettings.value.payout = { bank: 'GTBank', accountNumber: '0123456789' };
	});

	afterEach(() => {
		cleanup();
		queryClient.invalidate('');
		vi.unstubAllGlobals();
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
	});

	it('replaces Instant Payout with Request Payout and keeps it disabled on active (unclosed) events', () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('/api/approvals')) return new Response(JSON.stringify([]));
				return new Response(JSON.stringify(computeOrganizer([activeEvent, pastEventA], [], [], [])));
			})
		);

		render(OrganizerPage, {
			props: {
				data: {
					...baseData,
					payload: computeOrganizer([activeEvent, pastEventA], [], [], []),
					approvals: []
				}
			}
		});

		expect(document.body.textContent).not.toMatch(/Instant Payout/i);

		const payoutButtons = screen.getAllByRole('button', { name: 'Request Payout' });
		expect(payoutButtons.length).toBeGreaterThan(0);
		for (const btn of payoutButtons) {
			expect(btn).toBeDisabled();
			expect(btn.getAttribute('data-payout-state')).toBe('locked');
		}
	});

	it('renders the Past tab where the ONLY action on past events is Request Payout, and transitions to Payout Requested on click', async () => {
		let storedApprovals: ApprovalRequest[] = [];
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (String(url).includes('/api/approvals') && init?.method === 'POST') {
				const reqBody = JSON.parse(String(init.body ?? '{}')) as {
					amount: number;
					subjectId: string;
					subjectLabel: string;
				};
				const created: ApprovalRequest = {
					id: 'ap-created-1',
					kind: 'payout',
					status: 'pending',
					requesterId: 'u-org',
					title: `Payout request · ${reqBody.subjectLabel}`,
					summary: 'Cleared settlement balance requested',
					amount: reqBody.amount,
					subjectId: reqBody.subjectId,
					subjectLabel: reqBody.subjectLabel,
					payload: { eventId: reqBody.subjectId },
					createdAt: new Date().toISOString()
				};
				storedApprovals = [created];
				return new Response(JSON.stringify(created), { status: 201 });
			}
			if (String(url).includes('/api/approvals')) {
				return new Response(JSON.stringify(storedApprovals));
			}
			return new Response(JSON.stringify(computeOrganizer([activeEvent, pastEventA], [], [], [])));
		});
		vi.stubGlobal('fetch', fetchMock);

		render(OrganizerPage, {
			props: {
				data: {
					...baseData,
					payload: computeOrganizer([activeEvent, pastEventA], [], [], []),
					approvals: []
				}
			}
		});

		// Past event is not listed on the Active tab; switch to the Past tab.
		const pastTabs = screen.getAllByRole('tab', { name: /^Past/i });
		expect(pastTabs.length).toBeGreaterThan(0);
		await fireEvent.click(pastTabs[0]);
		await tick();

		// Past event card is shown.
		expect(screen.getAllByText('October Jazz Night').length).toBeGreaterThan(0);

		// On the Past tab, operational/edit controls are completely absent:
		expect(screen.queryByRole('link', { name: /Edit Wizard/i })).toBeNull();
		expect(screen.queryByRole('link', { name: /Manage Event/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Broadcast Announcement/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Door Staff PINs/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Generate PIN/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Export Attendee CSV/i })).toBeNull();

		// Request Payout is enabled for the closed past event.
		const requestBtns = screen.getAllByRole('button', { name: 'Request Payout' });
		expect(requestBtns.length).toBeGreaterThan(0);
		expect(requestBtns[0]).not.toBeDisabled();

		// Click Request Payout -> button changes to "Payout Requested" and disables.
		await fireEvent.click(requestBtns[0]);
		await waitFor(() => {
			const requestedBtns = screen.getAllByRole('button', { name: 'Payout Requested' });
			expect(requestedBtns.length).toBeGreaterThan(0);
			for (const btn of requestedBtns) {
				expect(btn).toBeDisabled();
				expect(btn.getAttribute('data-payout-state')).toBe('requested');
			}
		});
	});

	it('renders Approved in green (and permanently disabled) when approved by admin, and Denied in red when denied by admin', async () => {
		const pastApproved = makeEvent({
			id: 'ev-past-approved',
			slug: 'approved-gala',
			title: 'Approved Gala',
			startsAt: '2026-09-10T18:00:00+01:00',
			endsAt: '2026-09-10T22:00:00+01:00',
			status: 'closed'
		});
		const pastDenied = makeEvent({
			id: 'ev-past-denied',
			slug: 'denied-gala',
			title: 'Denied Gala',
			startsAt: '2026-09-12T18:00:00+01:00',
			endsAt: '2026-09-12T22:00:00+01:00',
			status: 'closed'
		});
		const approvals: ApprovalRequest[] = [
			{
				id: 'ap-approved',
				kind: 'payout',
				status: 'approved',
				requesterId: 'u-org',
				title: 'Payout request · Approved Gala',
				summary: 'Approved',
				amount: 140_000,
				subjectId: 'ev-past-approved',
				createdAt: '2026-10-20T10:00:00Z'
			},
			{
				id: 'ap-denied',
				kind: 'payout',
				status: 'rejected',
				requesterId: 'u-org',
				title: 'Payout request · Denied Gala',
				summary: 'Denied',
				note: 'Bank account holder mismatch.',
				amount: 140_000,
				subjectId: 'ev-past-denied',
				createdAt: '2026-10-21T10:00:00Z'
			}
		];

		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (String(url).includes('/api/approvals')) return new Response(JSON.stringify(approvals));
			return new Response(JSON.stringify(computeOrganizer([pastApproved, pastDenied], [], [], [])));
		});
		vi.stubGlobal('fetch', fetchMock);
		(page as unknown as { url: URL }).url = new URL('http://localhost/organizer?tab=past');

		render(OrganizerPage, {
			props: {
				data: {
					...baseData,
					payload: computeOrganizer([pastApproved, pastDenied], [], [], []),
					approvals
				}
			}
		});
		await tick();

		const approvedBtns = screen.getAllByRole('button', { name: 'Approved' });
		expect(approvedBtns.length).toBeGreaterThan(0);
		for (const btn of approvedBtns) {
			expect(btn).toBeDisabled();
			expect(btn.className).toContain('bg-emerald-600');
			expect(btn.getAttribute('data-payout-state')).toBe('approved');
		}

		// Clicking an Approved button never fires a new POST /api/approvals request.
		await fireEvent.click(approvedBtns[0]);
		expect(
			fetchMock.mock.calls.some(
				([url, init]) => String(url).includes('/api/approvals') && init?.method === 'POST'
			)
		).toBe(false);

		const deniedBtns = screen.getAllByRole('button', { name: 'Denied' });
		expect(deniedBtns.length).toBeGreaterThan(0);
		for (const btn of deniedBtns) {
			expect(btn.className).toContain('bg-red-600');
			expect(btn.getAttribute('data-payout-state')).toBe('denied');
		}
	});

	it('locks past events on /organizer/events/[id], /organizer/create?edit=..., broadcast, and gate PINs so only payout requests are allowed', async () => {
		// Direct /organizer/events/[id] render for a closed event hides edit, delete, scanner, CSV, and broadcast
		render(ManageEventPage, {
			props: {
				data: {
					...baseData,
					organizer: computeOrganizer([pastEventA], [], [], []),
					event: pastEventA,
					tickets: [],
					orders: [],
					checkins: [],
					approvals: []
				}
			}
		});
		expect(screen.queryByRole('button', { name: /Edit event/i })).toBeNull();
		expect(screen.queryByRole('link', { name: /Open scanner/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Export CSV/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /Broadcast to ticket holders/i })).toBeNull();
		expect(screen.getByRole('button', { name: 'Request Payout' })).not.toBeDisabled();

		// Wizard edit loader redirects closed events to /organizer?tab=past
		await expect(
			createWizardLoad({
				locals: { session: { userId: 'u-ada', role: 'organizer' } },
				cookies: { getAll: () => [], get: () => undefined, set: vi.fn(), delete: vi.fn() },
				url: new URL(`http://localhost/organizer/create?edit=${demo.pastSessionEvent.id}`)
			} as never)
		).rejects.toMatchObject({ status: 302, location: '/organizer?tab=past' });

		// Server actions on /organizer/events/[id] block updateEvent, deleteEvent, and broadcast on past events
		const updateForm = new FormData();
		updateForm.set('title', 'Edited Past Title');
		updateForm.set('venue', 'Hall');
		updateForm.set('city', 'Lagos');
		const updateRes = await manageEventActions.updateEvent!({
			request: new Request('http://localhost', { method: 'POST', body: updateForm }),
			locals: { session: { userId: 'u-ada', role: 'organizer' } },
			cookies: { getAll: () => [], get: () => undefined, set: vi.fn(), delete: vi.fn() },
			params: { id: demo.pastSessionEvent.id }
		} as never);
		expect(updateRes).toMatchObject({ status: 400 });

		const deleteRes = await manageEventActions.deleteEvent!({
			locals: { session: { userId: 'u-ada', role: 'organizer' } },
			cookies: { getAll: () => [], get: () => undefined, set: vi.fn(), delete: vi.fn() },
			params: { id: demo.pastSessionEvent.id }
		} as never);
		expect(deleteRes).toMatchObject({ status: 400 });

		await expect(
			demoSource.broadcastEvent('u-ada', demo.pastSessionEvent.id, 'Late message')
		).rejects.toThrow(/Past events are closed/i);
		await expect(
			demoSource.issueGateToken('u-ada', demo.pastSessionEvent.id, 'Courtyard Gate')
		).rejects.toThrow(/Past events are closed/i);

		// Ensure createWizardActions is imported & defined
		expect(typeof createWizardActions.create).toBe('function');
	});

	it('enforces closed-event & non-repeatable-approved payout rules in supabaseSource.createApproval', async () => {
		const userId = '11111111-1111-4111-8111-111111111111';
		const activeEventId = '22222222-2222-4222-8222-222222222222';
		const closedEventId = '33333333-3333-4333-8333-333333333333';

		const makeDb = (eventRow: Record<string, unknown> | null, existingPayouts: Record<string, unknown>[]) => {
			const eventsChain = {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				maybeSingle: vi.fn().mockResolvedValue({ data: eventRow, error: null })
			};
			const approvalsSelectChain = {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				in: vi.fn().mockResolvedValue({ data: existingPayouts, error: null }),
				insert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'ap-live-1',
								kind: 'payout',
								status: 'pending',
								requester_id: userId,
								title: 'Payout request · Closed Show',
								summary: 'Requested',
								amount: 200_000,
								subject_id: closedEventId,
								subject_label: 'Closed Show',
								payload: { eventId: closedEventId },
								created_at: new Date().toISOString()
							},
							error: null
						})
					})
				})
			};
			const notificationsChain = {
				insert: vi.fn().mockResolvedValue({ error: null })
			};
			return supabaseSource({
				from: vi.fn((table: string) => {
					if (table === 'events') return eventsChain;
					if (table === 'approval_requests') return approvalsSelectChain;
					if (table === 'notifications') return notificationsChain;
					throw new Error(`Unexpected table ${table}`);
				})
			} as never);
		};

		// 1. Active (unclosed) event is rejected
		const activeSource = makeDb(
			{
				id: activeEventId,
				organizer_id: userId,
				status: 'published',
				starts_at: '2026-12-20T18:00:00+01:00',
				ends_at: '2026-12-20T23:00:00+01:00'
			},
			[]
		);
		await expect(
			activeSource.createApproval(userId, {
				kind: 'payout',
				title: 'Payout request · Active Show',
				summary: 'Requested',
				amount: 200_000,
				subjectId: activeEventId
			})
		).rejects.toThrow(/after the event closes/i);

		// 2. Closed event with an already-approved payout is rejected
		const approvedSource = makeDb(
			{
				id: closedEventId,
				organizer_id: userId,
				status: 'published',
				starts_at: '2026-09-01T18:00:00+01:00',
				ends_at: '2026-09-01T23:00:00+01:00'
			},
			[{ id: 'ap-old', status: 'approved' }]
		);
		await expect(
			approvedSource.createApproval(userId, {
				kind: 'payout',
				title: 'Payout request · Closed Show',
				summary: 'Requested',
				amount: 200_000,
				subjectId: closedEventId
			})
		).rejects.toThrow(/already been approved/i);

		// 3. Closed event with no pending/approved payout succeeds
		const eligibleSource = makeDb(
			{
				id: closedEventId,
				organizer_id: userId,
				status: 'published',
				starts_at: '2026-09-01T18:00:00+01:00',
				ends_at: '2026-09-01T23:00:00+01:00'
			},
			[]
		);
		const created = await eligibleSource.createApproval(userId, {
			kind: 'payout',
			title: 'Payout request · Closed Show',
			summary: 'Requested',
			amount: 200_000,
			subjectId: closedEventId
		});
		expect(created.status).toBe('pending');
		expect(created.subjectId).toBe(closedEventId);
	});
});

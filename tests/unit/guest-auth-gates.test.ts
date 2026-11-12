import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';

const source = vi.hoisted(() => ({
	mode: 'demo',
	getEvent: vi.fn(),
	getEventMessageRequest: vi.fn(),
	recordEventView: vi.fn(),
	resolvePromoCode: vi.fn(),
	createOrder: vi.fn(),
	getTickets: vi.fn(),
	listApprovals: vi.fn()
}));

vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null, supabaseConfigured: () => false }));
vi.mock('$lib/server/datasource', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/datasource')>();
	return { ...actual, getSource: () => source };
});

import { load as eventLoad } from '../../src/routes/(app)/events/[slug]/+page.server';
import { load as checkoutLoad, actions as checkoutActions } from '../../src/routes/(app)/checkout/+page.server';
import { load as checkoutSuccessLoad } from '../../src/routes/(app)/checkout/success/+page.server';
import { load as ticketsLoad } from '../../src/routes/(app)/tickets/+page';
import { GET as apiTickets } from '../../src/routes/api/tickets/+server';
import { actions as loginActions } from '../../src/routes/auth/login/+page.server';
import { actions as signupActions } from '../../src/routes/auth/signup/+page.server';
import { load as verifyLoad, actions as verifyActions } from '../../src/routes/auth/verify/+page.server';
import TicketsPage from '../../src/routes/(app)/tickets/+page.svelte';
import ProfilePage from '../../src/routes/(app)/profile/+page.svelte';
import EventPage from '../../src/routes/(app)/events/[slug]/+page.svelte';
import { events as demoEvents } from '../../src/lib/server/demo/seed';

const userId = '11111111-1111-4111-8111-111111111111';
const session = { userId, email: 'ada@example.test', handle: 'adaobi', name: 'Ada Obi', role: 'attendee' as const, avatarUrl: null };
const event = {
	id: 'event-1',
	slug: 'promo-night',
	title: 'Promo Night',
	tiers: [{ id: 'tier-1', name: 'General', price: 10_000, sold: 0, capacity: 100 }]
};
const cookies = { get: () => undefined, getAll: () => [], set: vi.fn(), delete: vi.fn() };
const layoutData = { session: null, demoMode: true, operatingIdentity: 'attendee' as const, unread: 0, inboxUnread: 0, currentProfile: null, followingIds: [] as string[], followLoadError: false };

beforeEach(() => {
	vi.clearAllMocks();
	source.getEvent.mockResolvedValue(event);
	source.getEventMessageRequest.mockResolvedValue(undefined);
	source.recordEventView.mockResolvedValue(undefined);
	source.resolvePromoCode.mockResolvedValue(null);
	source.createOrder.mockResolvedValue({ orderId: 'order-1', tickets: [{ id: 'ticket-1' }] });
	source.getTickets.mockResolvedValue([]);
	source.listApprovals.mockResolvedValue([]);
	Object.assign(page.data, layoutData);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	Object.assign(page.data, layoutData);
});

describe('guest purchase gates (server)', () => {
	it('asks guests to sign in before checkout loads, preserving the checkout URL', async () => {
		await expect(
			checkoutLoad({
				url: new URL('http://localhost/checkout?event=promo-night&tier=tier-1&qty=2'),
				locals: { session: null, demoMode: true },
				cookies
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?next=%2Fcheckout%3Fevent%3Dpromo-night%26tier%3Dtier-1%26qty%3D2'
		});
		expect(source.getEvent).not.toHaveBeenCalled();
	});

	it('still loads checkout for signed-in buyers', async () => {
		const result = (await checkoutLoad({
			url: new URL('http://localhost/checkout?event=promo-night&tier=tier-1&qty=1'),
			locals: { session, demoMode: true },
			cookies
		} as never)) as unknown as { holder: { authenticated: boolean } };
		expect(result.holder.authenticated).toBe(true);
	});

	it('redirects a guest pay attempt to sign-in and never creates an order', async () => {
		const body = new FormData();
		body.set('event', 'promo-night');
		body.set('tier', 'tier-1');
		body.set('qty', '2');

		let location = '';
		try {
			await checkoutActions.pay({
				request: new Request('http://localhost/checkout', { method: 'POST', body }),
				locals: { session: null, demoMode: true },
				cookies,
				url: new URL('http://localhost/checkout')
			} as never);
		} catch (error) {
			location = (error as { location: string }).location;
		}
		expect(location.startsWith('/auth/login?next=')).toBe(true);
		expect(decodeURIComponent(location.split('next=')[1])).toBe('/checkout?event=promo-night&tier=tier-1&qty=2');
		expect(source.createOrder).not.toHaveBeenCalled();
	});

	it('asks for sign-in on the hosted-payment callback instead of minting demo tickets', async () => {
		await expect(
			checkoutSuccessLoad({
				url: new URL('http://localhost/checkout/success?ref=OWT-1&slug=promo-night&tier=tier-1&qty=1'),
				locals: { session: null, demoMode: true },
				cookies
			} as never)
		).rejects.toMatchObject({ status: 303 });
		expect(source.createOrder).not.toHaveBeenCalled();
	});
});

describe('guest tickets gates', () => {
	const apiFetch = (signedIn: boolean) =>
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (!signedIn) return new Response(JSON.stringify({ error: 'Sign in' }), { status: 401 });
			if (url.includes('/api/tickets')) return new Response(JSON.stringify(await source.getTickets(userId)));
			if (url.includes('/api/approvals')) return new Response(JSON.stringify(await source.listApprovals(userId)));
			return new Response('[]');
		});

	it('returns no tickets and a null session for guests without touching the demo account', async () => {
		const fetch = apiFetch(false);
		const result = await ticketsLoad({ fetch, parent: async () => ({ session: null }) } as never);
		expect(result).toEqual({ tickets: [], approvals: [], session: null });
		expect(fetch).not.toHaveBeenCalled();
		expect(source.getTickets).not.toHaveBeenCalled();
	});

	it('loads the signed-in holder\u2019s own tickets', async () => {
		const fetch = apiFetch(true);
		const result = (await ticketsLoad({ fetch, parent: async () => ({ session }) } as never)) as unknown as {
			session: typeof session;
		};
		expect(fetch).toHaveBeenCalledWith('/api/tickets');
		expect(source.getTickets).toHaveBeenCalledWith(userId);
		expect(source.listApprovals).toHaveBeenCalledWith(userId);
		expect(result.session.userId).toBe(userId);
	});

	it('rejects guest calls to /api/tickets with 401', async () => {
		const response = await apiTickets({ locals: { session: null, demoMode: true }, cookies } as never);
		expect(response.status).toBe(401);
		expect(source.getTickets).not.toHaveBeenCalled();
	});
});

describe('event detail load (server)', () => {
	it('still renders the event when the signed-in viewer\u2019s request lookup fails', async () => {
		// This is the shape of the regression that broke event pages only for
		// email logins: the request query runs for sessions only, and its error
		// propagated as a 500 instead of just hiding the contact widget.
		source.getEventMessageRequest.mockRejectedValueOnce(
			new Error('column message_requests.event_slug does not exist')
		);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = (await eventLoad({
			params: { slug: 'promo-night' },
			locals: { session, demoMode: true },
			cookies
		} as never)) as { event: { slug: string }; messageRequest: unknown };
		expect(result.event.slug).toBe('promo-night');
		expect(result.messageRequest).toBeNull();
		expect(source.getEventMessageRequest).toHaveBeenCalledWith(userId, event.id);
		expect(logged).toHaveBeenCalled();
		logged.mockRestore();
	});

	it('does not ask for a message request when the visitor is a guest', async () => {
		await eventLoad({
			params: { slug: 'promo-night' },
			locals: { session: null, demoMode: true },
			cookies
		} as never);
		expect(source.getEventMessageRequest).not.toHaveBeenCalled();
	});
});

describe('post-login return path plumbing', () => {
	const formRequest = (fields: Record<string, string>) => {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		return new Request('http://localhost/auth', { method: 'POST', body });
	};

	it('carries next from login through to the verify step', async () => {
		await expect(
			loginActions.sendCode({
				request: formRequest({ email: 'ada@example.test', next: '/tickets' }),
				cookies,
				url: new URL('http://localhost/auth/login?next=%2Ftickets')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/verify?email=ada%40example.test&next=%2Ftickets'
		});
	});

	it('defaults the return path to /home when none was requested', async () => {
		await expect(
			loginActions.sendCode({
				request: formRequest({ email: 'ada@example.test' }),
				cookies,
				url: new URL('http://localhost/auth/login')
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/auth/verify?email=ada%40example.test&next=%2Fhome' });
	});

	it('carries next from signup through to the verify step', async () => {
		await expect(
			signupActions.create({
				request: formRequest({
					email: 'ada@example.test',
					name: 'Ada Obi',
					username: 'adaobi',
					terms: 'accepted',
					ageConfirmed: 'confirmed',
					next: '/profile'
				}),
				cookies,
				url: new URL('http://localhost/auth/signup?next=%2Fprofile')
			} as never)
		).rejects.toMatchObject({ status: 303, location: expect.stringContaining('&next=%2Fprofile') });
	});

	it('lands on the requested page after the email code verifies', async () => {
		await expect(
			verifyActions.verify({
				request: formRequest({ email: 'ada@example.test', code: '000000', next: '/checkout?event=promo-night&tier=tier-1&qty=1' }),
				cookies,
				url: new URL('http://localhost/auth/verify')
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/checkout?event=promo-night&tier=tier-1&qty=1' });
	});

	it('sanitizes open-redirect attempts in the verify return path', async () => {
		const evil = (await verifyLoad({
			url: new URL('http://localhost/auth/verify?next=//evil.example'),
			cookies
		} as never)) as unknown as { next: string };
		expect(evil.next).toBe('/home');
		const good = (await verifyLoad({
			url: new URL('http://localhost/auth/verify?next=%2Ftickets'),
			cookies
		} as never)) as unknown as { next: string };
		expect(good.next).toBe('/tickets');
	});
});

describe('guest sign-in prompts (UI)', () => {
	it('asks guests to sign in on the Tickets tab and fetches nothing', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('[]'));
		vi.stubGlobal('fetch', fetcher);
		render(TicketsPage, { props: { data: { ...layoutData, tickets: [], approvals: [], session: null } } });

		expect(screen.getByText('Sign in to view your tickets')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/auth/login?next=/tickets');
		expect(screen.getByRole('link', { name: 'Create Account' })).toHaveAttribute('href', '/auth/signup?next=/tickets');
		expect(screen.queryByText('Ticket Wallet & Dynamic Passes')).not.toBeInTheDocument();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('opens the wallet for signed-in holders', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')));
		Object.assign(page.data, { ...layoutData, session });
		render(TicketsPage, { props: { data: { ...layoutData, tickets: [], approvals: [], session } } });

		expect(screen.queryByText('Sign in to view your tickets')).not.toBeInTheDocument();
		expect(screen.getByText('Ticket Wallet & Dynamic Passes')).toBeInTheDocument();
	});

	it('asks guests to sign in on the Profile tab and returns them there', () => {
		render(ProfilePage, { props: { data: { ...layoutData, tickets: [], profile: null, events: [] } } });

		expect(screen.getAllByText('Sign in to view your profile').length).toBeGreaterThan(0);
		for (const link of screen.getAllByRole('link', { name: 'Sign In' })) {
			expect(link).toHaveAttribute('href', '/auth/login?next=/profile');
		}
		for (const link of screen.getAllByRole('link', { name: 'Create Account' })) {
			expect(link).toHaveAttribute('href', '/auth/signup?next=/profile');
		}
	});

	it('asks guests to sign in when they try to purchase from the event page', async () => {
		render(EventPage, { props: { data: { ...layoutData, event: demoEvents[0], messageRequest: null } } });

		expect(screen.queryByText('Sign in to buy tickets')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /Select & Checkout/ }));

		expect(await screen.findByText('Sign in to buy tickets')).toBeInTheDocument();
		const signIn = screen.getByRole('link', { name: 'Sign In' });
		expect(signIn.getAttribute('href')).toContain(`/auth/login?next=${encodeURIComponent('/checkout?event=pulse-ai-summit-lagos&tier=tier-regular&qty=1')}`);
		expect(screen.getByRole('link', { name: 'Create Account' }).getAttribute('href')).toContain('/auth/signup?next=');
	});

	it('lets signed-in buyers proceed without the sign-in prompt', async () => {
		Object.assign(page.data, { ...layoutData, session });
		render(EventPage, { props: { data: { ...layoutData, session, event: demoEvents[0], messageRequest: null } } });

		await fireEvent.click(screen.getByRole('button', { name: /Select & Checkout/ }));
		expect(screen.queryByText('Sign in to buy tickets')).not.toBeInTheDocument();
	});
});

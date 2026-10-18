import TicketDetailPage from '../../src/routes/(app)/tickets/[id]/+page.svelte';
import { actions } from '../../src/routes/(app)/tickets/[id]/+page.server';
import { GET as searchProfilesGet } from '../../src/routes/api/profiles/search/+server';
import { demoSource, supabaseSource } from '$lib/server/datasource';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import type { Profile, Ticket } from '$lib/types';

const session = {
	userId: 'u-ada',
	email: 'ada@owltside.app',
	handle: 'adaobi',
	name: 'Ada Obi',
	role: 'attendee' as const,
	avatarUrl: null
};

const sampleTicket: Ticket = {
	id: 't-sample-transfer',
	code: 'EV-1111-2222-3333',
	eventId: 'e-afrobeats',
	eventSlug: 'afrobeats-sound-sunset',
	eventTitle: 'Afrobeats & Sound Sunset',
	eventStartsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
	venue: 'Landmark Beach',
	tierName: 'General',
	holder: 'Ada Obi',
	status: 'valid',
	purchasedAt: new Date(Date.now() - 86_400_000).toISOString(),
	price: 15_000,
	cover: { from: '#b45309', to: '#7c2d12', icon: 'audio-waveform' }
};

const candidateProfiles: Profile[] = [
	{
		id: 'u-ada',
		handle: 'adaobi',
		name: 'Ada Obi',
		avatarColor: '#8083ff',
		city: 'Lagos',
		followers: 214,
		following: 189
	},
	{
		id: 'u-tunde',
		handle: 'tundeb',
		name: 'Tunde Bakare',
		avatarColor: '#f59e0b',
		city: 'Lagos',
		followers: 388,
		following: 402
	},
	{
		id: 'u-amina',
		handle: 'drbello',
		name: 'Dr. Amina Bello',
		avatarColor: '#009eb9',
		city: 'Abuja',
		verified: true,
		followers: 12400,
		following: 310
	}
];

describe('ticket transfer user search & 1-to-1 transfer', () => {
	beforeEach(() => {
		page.url = new URL('http://localhost/tickets/t-sample-transfer') as typeof page.url;
		Object.assign(page.data, {
			session,
			demoMode: true,
			operatingIdentity: 'attendee',
			unread: 0
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('searches users with or without "@" and excludes the active user username', async () => {
		for (const query of ['tundeb', '@tundeb', 't']) {
			const res = await searchProfilesGet({
				url: new URL(`http://localhost/api/profiles/search?q=${encodeURIComponent(query)}`),
				locals: { session, demoMode: true },
				cookies: { getAll: () => [] }
			} as never);
			const list = (await res.json()) as Profile[];
			expect(list.some((p) => p.handle === 'tundeb')).toBe(true);
			expect(list.some((p) => p.handle === 'adaobi' || p.id === 'u-ada')).toBe(false);
		}

		// Searching the active user's own handle (with or without @) never includes the active user
		for (const selfQuery of ['adaobi', '@adaobi', 'Ada']) {
			const res = await searchProfilesGet({
				url: new URL(`http://localhost/api/profiles/search?q=${encodeURIComponent(selfQuery)}`),
				locals: { session, demoMode: true },
				cookies: { getAll: () => [] }
			} as never);
			const list = (await res.json()) as Profile[];
			expect(list.some((p) => p.handle === 'adaobi' || p.id === 'u-ada')).toBe(false);
		}
	});

	it('shows matching users when typing with "@" or without "@", excludes active user, and enforces 1-to-1 selection', async () => {
		const fetcher = vi.fn().mockImplementation(async () => {
			return new Response(JSON.stringify(candidateProfiles), { status: 200 });
		});
		vi.stubGlobal('fetch', fetcher);

		render(TicketDetailPage, {
			props: {
				data: {
					session,
					demoMode: true,
					operatingIdentity: 'attendee' as const,
					currentProfile: null,
					followingIds: [],
					unread: 0,
					followLoadError: false,
					ticket: { ...sampleTicket }
				}
			}
		});

		const transferButtons = screen.getAllByRole('button', { name: /Transfer/i });
		await fireEvent.click(transferButtons[0]);

		const input = screen.getByLabelText(/Recipient @handle/i) as HTMLInputElement;

		// 1. Typing without "@"
		await fireEvent.input(input, { target: { value: 'tunde' } });
		await waitFor(() =>
			expect(fetcher).toHaveBeenCalledWith('/api/profiles/search?q=tunde')
		);
		await waitFor(() =>
			expect(screen.getByRole('option', { name: /Tunde Bakare/i })).toBeInTheDocument()
		);
		// Active user (@adaobi) must be excluded even if returned by fetch
		expect(screen.queryByRole('option', { name: /Ada Obi/i })).toBeNull();

		// 2. Typing with "@"
		await fireEvent.input(input, { target: { value: '@drbello' } });
		await waitFor(() =>
			expect(fetcher).toHaveBeenCalledWith('/api/profiles/search?q=drbello')
		);
		const aminaOption = await screen.findByRole('option', { name: /Dr\. Amina Bello/i });
		expect(aminaOption).toBeInTheDocument();

		// 3. Selecting a user locks in 1-to-1 recipient
		await fireEvent.click(aminaOption);
		expect(input.value).toBe('@drbello');
		expect(screen.getByTestId('selected-transfer-recipient')).toHaveTextContent('Dr. Amina Bello');
		expect(screen.queryByRole('listbox', { name: 'Matching users' })).toBeNull();

		// 4. Clearing recipient lets user pick a different single recipient
		await fireEvent.click(screen.getByRole('button', { name: 'Clear selected recipient' }));
		expect(input.value).toBe('');
		expect(screen.queryByTestId('selected-transfer-recipient')).toBeNull();
	});

	it('transfers ticket 1-to-1 in demo datasource, rotates code, and creates notifications', async () => {
		const order = await demoSource.createOrder('u-ada', 'afrobeats-sound-sunset', [
			{ tierId: 'tier-general', qty: 1 }
		]);
		const minted = order.tickets[0];
		const originalCode = minted.code;

		// Rejects self-transfer and multi-recipient transfer
		await expect(demoSource.transferTicket('u-ada', minted.id, '@adaobi')).rejects.toThrow(
			/yourself/i
		);
		await expect(
			demoSource.transferTicket('u-ada', minted.id, '@tundeb, @femiade')
		).rejects.toThrow(/1-to-1/i);

		const transferred = await demoSource.transferTicket('u-ada', minted.id, 'tundeb');
		expect(transferred.status).toBe('transferred');
		expect(transferred.holder).toBe('Tunde Bakare');
		expect(transferred.code).not.toBe(originalCode);

		// Cannot transfer an already transferred ticket again
		await expect(demoSource.transferTicket('u-ada', minted.id, 'femiade')).rejects.toThrow(
			/Only active tickets can be transferred/i
		);

		// Recipient has the active ticket in their wallet
		const recipientTickets = await demoSource.getTickets('u-tunde');
		expect(
			recipientTickets.some(
				(t) => t.id === minted.id && t.status === 'valid' && t.code === transferred.code
			)
		).toBe(true);

		// Notifications created for both recipient and sender
		const recipientNotifs = await demoSource.getNotifications('u-tunde');
		expect(
			recipientNotifs.some(
				(n) =>
					n.kind === 'ticket' &&
					n.title.includes('Pass Transferred') &&
					n.body.includes('transferred to your wallet')
			)
		).toBe(true);

		const senderNotifs = await demoSource.getNotifications('u-ada');
		expect(
			senderNotifs.some(
				(n) =>
					n.kind === 'ticket' &&
					n.title.includes('Pass Transferred') &&
					n.body.includes('@tundeb')
			)
		).toBe(true);
	});

	it('syncs ticket transfer on Supabase database and inserts notifications with href', async () => {
		const senderId = '11111111-1111-4111-8111-111111111111';
		const recipientId = '22222222-2222-4222-8222-222222222222';
		const ticketId = '33333333-3333-4333-8333-333333333333';

		const profilesChain = {
			select: vi.fn().mockReturnThis(),
			ilike: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({
				data: { id: recipientId, handle: 'femiade', name: 'Femi Adeyemi' },
				error: null
			})
		};

		const ticketRow = {
			id: ticketId,
			owner_id: senderId,
			code: 'EV-OLD1-OLD2-OLD3',
			event_id: '44444444-4444-4444-8444-444444444444',
			event_slug: 'afrobeats-sound-sunset',
			event_title: 'Afrobeats & Sound Sunset',
			event_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
			venue: 'Landmark Beach',
			tier_name: 'General',
			holder_name: 'Segun Alakija',
			status: 'valid',
			purchased_at: new Date().toISOString(),
			price: 15000,
			cover: { from: '#b45309', to: '#7c2d12', icon: 'audio-waveform' }
		};

		const updateEqChain = {
			eq: vi.fn().mockReturnThis(),
			then: (fn: (val: unknown) => unknown) => Promise.resolve({ error: null }).then(fn)
		};

		const ticketsChain = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: ticketRow, error: null }),
			update: vi.fn().mockReturnValue(updateEqChain)
		};

		const notificationsChain = {
			insert: vi.fn().mockResolvedValue({ error: null })
		};

		const from = vi.fn((table: string) => {
			if (table === 'profiles') return profilesChain;
			if (table === 'tickets') return ticketsChain;
			if (table === 'notifications') return notificationsChain;
			throw new Error(`Unexpected table: ${table}`);
		});

		const source = supabaseSource({ from } as unknown as SupabaseClient);
		const result = await source.transferTicket(senderId, ticketId, '@femiade');

		expect(ticketsChain.update).toHaveBeenCalledWith(
			expect.objectContaining({
				owner_id: recipientId,
				holder_name: 'Femi Adeyemi',
				code: expect.stringMatching(/^EV-/),
				status: 'valid'
			})
		);
		expect(result.holder).toBe('Femi Adeyemi');
		expect(result.code).not.toBe('EV-OLD1-OLD2-OLD3');

		expect(notificationsChain.insert).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					user_id: recipientId,
					kind: 'ticket',
					title: 'Pass Transferred · Afrobeats & Sound Sunset',
					href: `/tickets/${ticketId}`
				}),
				expect.objectContaining({
					user_id: senderId,
					kind: 'ticket',
					title: 'Pass Transferred · Afrobeats & Sound Sunset',
					href: '/tickets'
				})
			])
		);
	});

	it('validates form action for 1-to-1 transfer and self-transfer', async () => {
		const selfForm = new FormData();
		selfForm.set('handle', '@adaobi');
		const selfRes = await actions.transfer!({
			request: new Request('http://localhost/tickets/t-afrobeats-ada?/transfer', {
				method: 'POST',
				body: selfForm
			}),
			params: { id: 't-afrobeats-ada' },
			locals: { session, demoMode: true },
			cookies: { getAll: () => [] }
		} as never);
		expect(selfRes).toMatchObject({
			status: 400,
			data: { error: expect.stringMatching(/yourself/i) }
		});

		const multiForm = new FormData();
		multiForm.set('handle', '@tundeb, @femiade');
		const multiRes = await actions.transfer!({
			request: new Request('http://localhost/tickets/t-afrobeats-ada?/transfer', {
				method: 'POST',
				body: multiForm
			}),
			params: { id: 't-afrobeats-ada' },
			locals: { session, demoMode: true },
			cookies: { getAll: () => [] }
		} as never);
		expect(multiRes).toMatchObject({
			status: 400,
			data: { error: expect.stringMatching(/1-to-1/i) }
		});
	});
});

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import { supabaseSource } from '$lib/server/datasource';
import type { Ticket } from '$lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import TicketDetailPage from '../../src/routes/(app)/tickets/[id]/+page.svelte';

const session = {
	userId: 'u-ada',
	email: 'ada@owltside.app',
	handle: 'adaobi',
	name: 'Ada Obi',
	role: 'attendee' as const,
	avatarUrl: null
};

const verifiedTicket: Ticket = {
	id: 't-verified',
	code: 'EV-1111-2222-3333',
	eventId: 'e-afrobeats',
	eventSlug: 'afrobeats-sound-sunset',
	eventTitle: 'Afrobeats & Sound Sunset',
	eventStartsAt: new Date(Date.now() + 86_400_000).toISOString(),
	venue: 'Landmark Beach',
	tierName: 'General',
	holder: 'Ada Obi',
	status: 'used',
	purchasedAt: new Date(Date.now() - 86_400_000).toISOString(),
	price: 15_000,
	cover: { from: '#b45309', to: '#7c2d12', icon: 'audio-waveform' }
};

beforeEach(() => {
	page.url = new URL('http://localhost/tickets/t-verified?transfer=1&refund=1') as typeof page.url;
	Object.assign(page.data, {
		session,
		demoMode: true,
		operatingIdentity: 'attendee',
		unread: 0,
		inboxUnread: 0
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('verified ticket holder state', () => {
	it('marks the pass verified and disables transfer, wallet, and refund controls', () => {
		render(TicketDetailPage, {
			props: {
				data: {
					session,
					demoMode: true,
					operatingIdentity: 'attendee' as const,
					currentProfile: null,
					followingIds: [],
					unread: 0,
					inboxUnread: 0,
					followLoadError: false,
					refundRequest: null,
					ticket: verifiedTicket
				}
			}
		});

		expect(screen.getAllByText(/Verified at the gate/i).length).toBeGreaterThan(0);
		for (const button of screen.getAllByRole('button', { name: /^Transfer$/i })) {
			expect(button).toBeDisabled();
		}
		for (const button of screen.getAllByRole('button', { name: /^Refund$/i })) {
			expect(button).toBeDisabled();
		}
		for (const button of screen.getAllByRole('button', { name: /Apple \/ Google/i })) {
			expect(button).toBeDisabled();
		}
		// Direct transfer/refund deep links do not open their sheets after check-in.
		expect(screen.queryByLabelText(/Recipient @handle/i)).toBeNull();
		expect(screen.queryByText(/Reason for Cancellation/i)).toBeNull();
	});

	it('refuses to open a refund request for a Supabase ticket that is no longer valid', async () => {
		const ownerId = '11111111-1111-4111-8111-111111111111';
		const ticketId = '22222222-2222-4222-8222-222222222222';
		const eq = vi.fn().mockReturnThis();
		const ticketsChain = {
			eq,
			select: vi.fn().mockReturnThis(),
			// A verified (used) pass: readable, but not refundable.
			maybeSingle: vi.fn().mockResolvedValue({
				data: { id: ticketId, code: 'EV-1', event_title: 'Gone', tier_name: 'VIP', price: 1000, status: 'used' },
				error: null
			})
		};
		const from = vi.fn((table: string) => {
			if (table === 'tickets') return ticketsChain;
			throw new Error(`Unexpected table ${table}`);
		});
		const source = supabaseSource({ from } as unknown as SupabaseClient);

		await expect(source.requestTicketRefund(ownerId, ticketId, { reason: 'Emergency' })).rejects.toThrow(
			'Only active tickets can be refunded'
		);
		expect(eq).toHaveBeenCalledWith('owner_id', ownerId);
	});
});

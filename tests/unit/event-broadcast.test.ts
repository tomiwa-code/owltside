import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoSource, supabaseSource } from '$lib/server/datasource';
import { actions } from '../../src/routes/(app)/organizer/+page.server';

const organizerId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';

describe('event broadcast announcements reach ticket owners', () => {
	it('drops the announcement into the notification hub of every pass owner', async () => {
		const sent = await demoSource.broadcastEvent('demo', 'e-rooftop', 'Gate 1 is now open');
		expect(sent).toBeGreaterThan(0);

		for (const owner of ['u-ada', 'u-tunde', 'u-femi']) {
			const notifications = await demoSource.getNotifications(owner);
			const announcement = notifications.find((n) => n.title.startsWith('Announcement · Yaba Rooftop Sessions'));
			expect(announcement, `expected ${owner} to receive the announcement`).toBeTruthy();
			expect(announcement?.body).toBe('Gate 1 is now open');
			expect(announcement?.href).toBe('/events/yaba-rooftop-sessions');
			expect(announcement?.kind).toBe('event');
			expect(announcement?.read).toBe(false);
		}
	});

	it('never announces to somebody without a pass for that event', async () => {
		await demoSource.broadcastEvent('demo', 'e-rooftop', 'Doors are open');

		const stranger = await demoSource.getNotifications('u-chiamaka');
		expect(stranger.some((n) => n.title.includes('Yaba Rooftop Sessions'))).toBe(false);
	});

	it('refuses to broadcast for an event the organizer does not own', async () => {
		await expect(demoSource.broadcastEvent('demo', 'e-afrobeats', 'Nope')).rejects.toThrow(
			/Event not found/i
		);
	});

	it('rejects an empty announcement', async () => {
		await expect(demoSource.broadcastEvent('demo', 'e-rooftop', '   ')).rejects.toThrow(
			/Enter a message/i
		);
	});

	it('marks the announcement as read with the rest of the hub', async () => {
		await demoSource.broadcastEvent('demo', 'e-rooftop', 'Doors are open');
		await demoSource.markAllNotificationsRead('u-tunde');

		const notifications = await demoSource.getNotifications('u-tunde');
		expect(notifications.every((n) => n.read)).toBe(true);
	});

	it('broadcasts through the organizer console action', async () => {
		const form = new FormData();
		form.set('message', 'Fast-pass holders use the left lane');
		form.set('eventId', 'e-rooftop');

		const result = await actions.broadcast!({
			request: new Request('http://localhost/organizer?/broadcast', { method: 'POST', body: form }),
			locals: { session: { userId: 'demo', role: 'organizer' } },
			cookies: { get: () => '' }
		} as never);

		expect(result).toMatchObject({ broadcasted: true });
		expect((result as { sent: number }).sent).toBeGreaterThan(0);

		const owner = await demoSource.getNotifications('u-tunde');
		expect(
			owner.some((n) => n.body === 'Fast-pass holders use the left lane')
		).toBe(true);
	});

	it('asks for a message and an event before broadcasting', async () => {
		const empty = new FormData();
		empty.set('eventId', 'e-rooftop');
		expect(
			await actions.broadcast!({
				request: new Request('http://localhost/organizer?/broadcast', { method: 'POST', body: empty }),
				locals: { session: { userId: 'demo', role: 'organizer' } },
				cookies: { get: () => '' }
			} as never)
		).toMatchObject({ status: 400, data: { error: expect.stringMatching(/message/i) } });

		const noEvent = new FormData();
		noEvent.set('message', 'Doors are open');
		expect(
			await actions.broadcast!({
				request: new Request('http://localhost/organizer?/broadcast', { method: 'POST', body: noEvent }),
				locals: { session: { userId: 'demo', role: 'organizer' } },
				cookies: { get: () => '' }
			} as never)
		).toMatchObject({ status: 400, data: { error: expect.stringMatching(/event/i) } });
	});
});

describe('supabase broadcast announcements', () => {
	const buildSource = (
		rpcError: { code?: string; message?: string } | null,
		sent = 0,
		ownsEvent = true
	) => {
		const eventsChain = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({
				data: ownsEvent
					? { id: eventId, title: 'Yaba Rooftop Sessions', slug: 'yaba-rooftop-sessions' }
					: null,
				error: null
			})
		};
		const ticketsChain = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			then: (fn: (value: unknown) => unknown) =>
				Promise.resolve({
					data: [{ owner_id: 'owner-a' }, { owner_id: 'owner-b' }, { owner_id: 'owner-a' }],
					error: null
				}).then(fn)
		};
		const notificationsChain = {
			insert: vi.fn().mockResolvedValue({ error: null })
		};
		const from = vi.fn((table: string) => {
			if (table === 'events') return eventsChain;
			if (table === 'tickets') return ticketsChain;
			if (table === 'notifications') return notificationsChain;
			throw new Error(`Unexpected table: ${table}`);
		});
		const rpc = vi.fn().mockResolvedValue(
			rpcError ? { data: null, error: rpcError } : { data: { sent }, error: null }
		);
		return {
			source: supabaseSource({ from, rpc } as unknown as SupabaseClient),
			eventsChain,
			ticketsChain,
			notificationsChain,
			rpc
		};
	};

	it('uses the broadcast RPC when it is installed', async () => {
		const { source, notificationsChain, rpc } = buildSource(null, 3);
		const sent = await source.broadcastEvent(organizerId, eventId, 'Doors are open');

		expect(sent).toBe(3);
		expect(rpc).toHaveBeenCalledWith('broadcast_to_event_holders', {
			p_event_id: eventId,
			p_body: 'Doors are open'
		});
		expect(notificationsChain.insert).not.toHaveBeenCalled();
	});

	it('falls back to a direct insert when the broadcast RPC is missing', async () => {
		const { source, notificationsChain, ticketsChain } = buildSource({
			code: '42883',
			message: 'function public.broadcast_to_event_holders(uuid, text) does not exist'
		});
		const sent = await source.broadcastEvent(organizerId, eventId, 'Doors are open');

		expect(sent).toBe(2);
		expect(ticketsChain.in).toHaveBeenCalledWith('status', ['valid', 'used']);
		expect(notificationsChain.insert).toHaveBeenCalledWith([
			expect.objectContaining({
				user_id: 'owner-a',
				kind: 'event',
				title: 'Announcement · Yaba Rooftop Sessions',
				body: 'Doors are open',
				href: '/events/yaba-rooftop-sessions'
			}),
			expect.objectContaining({ user_id: 'owner-b' })
		]);
	});

	it('refuses to broadcast for an event the organizer does not own', async () => {
		const { source, rpc } = buildSource(null, 1, false);
		await expect(source.broadcastEvent(organizerId, eventId, 'Doors are open')).rejects.toThrow(
			/Event not found/i
		);
		expect(rpc).not.toHaveBeenCalled();
	});
});

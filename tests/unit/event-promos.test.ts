// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const source = vi.hoisted(() => ({
	mode: 'demo',
	getEvent: vi.fn(),
	resolvePromoCode: vi.fn(),
	createOrder: vi.fn()
}));

vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null }));
vi.mock('$lib/server/datasource', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/datasource')>();
	return { ...actual, getSource: () => source };
});

import { supabaseSource } from '$lib/server/datasource';
import { POST as validatePromo } from '../../src/routes/api/events/[slug]/promo/+server';
import { actions as checkoutActions, load as checkoutLoad } from '../../src/routes/(app)/checkout/+page.server';
import { load as checkoutSuccessLoad } from '../../src/routes/(app)/checkout/success/+page.server';

const event = {
	id: 'event-1',
	slug: 'promo-night',
	title: 'Promo Night',
	tiers: [{ id: 'tier-1', name: 'General', price: 10_000, sold: 0, capacity: 100 }]
};
const resolvedPromo = { code: 'EARLY-BIRD', kind: 'pct', value: 20, source: 'event' } as const;
const userId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
	vi.clearAllMocks();
	source.mode = 'demo';
	source.getEvent.mockResolvedValue(event);
	source.resolvePromoCode.mockResolvedValue(resolvedPromo);
	source.createOrder.mockResolvedValue({
		orderId: 'order-1',
		reference: 'OWT-1',
		total: 8_000,
		tickets: [{ id: 'ticket-1' }]
	});
});

describe('event promo validation endpoint', () => {
	it('returns the discount for an organizer code belonging to the event', async () => {
		const response = await validatePromo({
			params: { slug: 'promo-night' },
			request: new Request('http://localhost/api/events/promo-night/promo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: 'early bird' })
			}),
			cookies: { getAll: () => [] }
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ valid: true, promo: resolvedPromo });
		expect(source.resolvePromoCode).toHaveBeenCalledWith('promo-night', 'EARLY-BIRD');
	});

	it('rejects a code that does not belong to the event', async () => {
		source.resolvePromoCode.mockResolvedValue(null);
		const response = await validatePromo({
			params: { slug: 'promo-night' },
			request: new Request('http://localhost/api/events/promo-night/promo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: 'WRONG' })
			}),
			cookies: { getAll: () => [] }
		} as never);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ valid: false });
	});
});

describe('checkout promo handling', () => {
	it('revalidates an event promo carried from the event page', async () => {
		const result = (await checkoutLoad({
			url: new URL('http://localhost/checkout?event=promo-night&tier=tier-1&qty=2&promo=early%20bird'),
			locals: { session: { userId, name: 'Ada', email: 'ada@example.test' }, demoMode: true },
			cookies: { getAll: () => [] }
		} as never)) as unknown as { promo: typeof resolvedPromo };

		expect(source.resolvePromoCode).toHaveBeenCalledWith('promo-night', 'EARLY-BIRD');
		expect(result.promo).toEqual(resolvedPromo);
	});

	it('redeems the validated code when the order is created', async () => {
		const body = new FormData();
		body.set('event', 'promo-night');
		body.set('tier', 'tier-1');
		body.set('qty', '2');
		body.set('promo', 'early bird');

		await expect(
			checkoutActions.pay({
				request: new Request('http://localhost/checkout', { method: 'POST', body }),
				locals: { session: { userId, email: 'ada@example.test' }, demoMode: true },
				cookies: { getAll: () => [] },
				url: new URL('http://localhost/checkout')
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/tickets/ticket-1?new=1' });

		expect(source.createOrder).toHaveBeenCalledWith(
			userId,
			'promo-night',
			[{ tierId: 'tier-1', qty: 2 }],
			'EARLY-BIRD'
		);
	});

	it('does not create an order for an invalid submitted code', async () => {
		source.resolvePromoCode.mockResolvedValue(null);
		const body = new FormData();
		body.set('event', 'promo-night');
		body.set('tier', 'tier-1');
		body.set('qty', '1');
		body.set('promo', 'WRONG');

		const result = await checkoutActions.pay({
			request: new Request('http://localhost/checkout', { method: 'POST', body }),
			locals: { session: { userId, email: 'ada@example.test' }, demoMode: true },
			cookies: { getAll: () => [] },
			url: new URL('http://localhost/checkout')
		} as never);

		expect(result).toMatchObject({ status: 400, data: { error: expect.stringContaining('isn’t valid') } });
		expect(source.createOrder).not.toHaveBeenCalled();
	});

	it('carries the promo through the hosted-payment success callback', async () => {
		await expect(
			checkoutSuccessLoad({
				url: new URL('http://localhost/checkout/success?ref=ref-1&slug=promo-night&tier=tier-1&qty=2&promo=early-bird'),
				cookies: { getAll: () => [] },
				locals: { session: { userId } }
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/tickets/ticket-1?new=1' });

		expect(source.createOrder).toHaveBeenCalledWith(
			userId,
			'promo-night',
			[{ tierId: 'tier-1', qty: 2 }],
			'EARLY-BIRD'
		);
	});
});

describe('Supabase event promo datasource', () => {
	it('validates through the private promo RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: { valid: true, code: 'EARLY-BIRD', kind: 'pct', value: 20 },
			error: null
		});
		const dbSource = supabaseSource({ rpc } as unknown as SupabaseClient);

		await expect(dbSource.resolvePromoCode('promo-night', 'early bird')).resolves.toEqual(resolvedPromo);
		expect(rpc).toHaveBeenCalledWith('validate_event_promo', {
			p_event_slug: 'promo-night',
			p_code: 'EARLY-BIRD'
		});
	});

	it('passes the promo to create_order and falls back only for unpromoted legacy orders', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: { orderId: 'order-1', reference: 'OWT-1', total: 8_000, tickets: [] },
			error: null
		});
		const dbSource = supabaseSource({ rpc } as unknown as SupabaseClient);
		await dbSource.createOrder(userId, 'promo-night', [{ tierId: 'tier-1', qty: 1 }], 'EARLY-BIRD');
		expect(rpc).toHaveBeenCalledWith('create_order', expect.objectContaining({ p_promo_code: 'EARLY-BIRD' }));

		rpc
			.mockResolvedValueOnce({
				data: null,
				error: { code: 'PGRST202', message: 'Could not find the function public.create_order' }
			})
			.mockResolvedValueOnce({
				data: { orderId: 'order-2', reference: 'OWT-2', total: 10_000, tickets: [] },
				error: null
			});
		await dbSource.createOrder(userId, 'promo-night', [{ tierId: 'tier-1', qty: 1 }]);
		expect(rpc).toHaveBeenLastCalledWith('create_order', {
			p_owner: userId,
			p_event_slug: 'promo-night',
			p_items: [{ tierId: 'tier-1', qty: 1 }]
		});
	});

	it('inserts normalized promo rows after creating an event', async () => {
		const eventId = '22222222-2222-4222-8222-222222222222';
		const profile = {
			id: userId,
			handle: 'adaobi',
			name: 'Ada Obi',
			avatar_color: '#8083ff',
			avatar_url: null,
			followers: 0,
			following: 0
		};
		const eventRow = {
			id: eventId,
			slug: 'promo-created',
			title: 'Promo Created',
			category: 'music',
			tags: [],
			starts_at: new Date().toISOString(),
			ends_at: null,
			venue: 'Promo Hall',
			city: 'Lagos',
			cover: { from: '#111827', to: '#312e81', icon: 'image' },
			description: 'Created with a promo.',
			organizer: profile,
			speakers: [],
			agenda: [],
			tiers: [{ id: 'tier-0', name: 'General', price: 10_000, sold: 0, capacity: 100 }],
			gates: [],
			faqs: [],
			policies: [],
			views_today: 0,
			attendees: 0,
			live: true
		};
		const eventsChain = {
			insert: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: eventRow, error: null })
		};
		const promoInsert = vi.fn().mockResolvedValue({ error: null });
		const from = vi.fn((table: string) => {
			if (table === 'events') return eventsChain;
			if (table === 'event_promos') return { insert: promoInsert };
			throw new Error(`Unexpected table ${table}`);
		});
		const dbSource = supabaseSource({ from } as unknown as SupabaseClient);

		const created = await dbSource.createEvent(userId, {
			title: 'Promo Created',
			category: 'music',
			tags: [],
			startsAt: new Date().toISOString(),
			venue: 'Promo Hall',
			city: 'Lagos',
			description: 'Created with a promo.',
			cover: { from: '#111827', to: '#312e81', icon: 'image' },
			tiers: [{ name: 'General', price: 10_000, capacity: 100 }],
			promos: [{ code: 'early bird', percent: 20, maxUses: 25 }],
			agenda: [],
			speakers: [],
			gates: []
		});

		expect(promoInsert).toHaveBeenCalledWith([
			{ event_id: eventId, code: 'EARLY-BIRD', percent: 20, max_uses: 25 }
		]);
		expect(created.promos).toEqual([{ code: 'EARLY-BIRD', percent: 20, maxUses: 25, uses: 0 }]);
	});
});

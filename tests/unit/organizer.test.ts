import { computeOrganizer, demoSource } from '$lib/server/datasource';
import { ticketsToCsv } from '$lib/utils/csv';
import { describe, expect, it } from 'vitest';
import type { EventItem, Order, Ticket, WizardPayload } from '$lib/types';

const payload: WizardPayload = {
	title: 'Test Launch Night',
	category: 'conferences',
	tags: ['Tech'],
	startsAt: new Date(Date.now() + 86_400_000).toISOString(),
	endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
	venue: 'Test Venue',
	city: 'Lagos',
	description: 'A test event.',
	cover: { from: '#000', to: '#111', icon: 'mic' },
	tiers: [
		{ name: 'Regular', price: 10_000, capacity: 100 },
		{ name: 'VIP', price: 25_000, capacity: 20 }
	],
	agenda: [{ start: 'Day 1 09:00', title: 'Doors', location: 'Hall A' }],
	speakers: [],
	gates: [{ id: 'gate-0', name: 'Gate 1', modes: ['QR'], staff: ['Staff 1'] }]
};

describe('demoSource.createEvent', () => {
	it('creates a slug, assigns tier ids and stores the event', async () => {
		const event = await demoSource.createEvent('demo', payload);
		expect(event.slug).toBe('test-launch-night');
		expect(event.endsAt).toBe(payload.endsAt);
		expect(event.tiers).toHaveLength(2);
		expect(event.tiers[0]).toMatchObject({ id: 'tier-0', name: 'Regular', sold: 0 });
		expect(event.gates?.[0].name).toBe('Gate 1');
		expect(event.organizer.name).toBe('Ada Obi');
		const stored = await demoSource.getOrganizerEvent(event.id);
		expect(stored?.id).toBe(event.id);
	});
});

describe('demoSource.checkInTicket', () => {
	it('verifies an unused ticket and marks it used', async () => {
		const code = 'EV-RT41-AAAA-0007';
		const first = await demoSource.checkInTicket('e-rooftop', code, 'Gate 1');
		expect(first.result).toBe('verified');
		expect(first.holder).not.toBe('Unknown pass');

		const ticket = (await demoSource.getEventTickets('e-rooftop')).find((t) => t.code === code);
		expect(ticket?.status).toBe('used');
	});

	it('flags a second scan of the same ticket as duplicate', async () => {
		const code = 'EV-RT41-AAAA-0008';
		await demoSource.checkInTicket('e-rooftop', code, 'Gate 1');
		const again = await demoSource.checkInTicket('e-rooftop', code, 'Gate 1');
		expect(again.result).toBe('duplicate');
	});

	it('flags unknown codes as invalid', async () => {
		const ck = await demoSource.checkInTicket('e-rooftop', 'EV-NOPE-0000-0000', 'Gate 1');
		expect(ck.result).toBe('invalid');
		expect(ck.holder).toBe('Unknown pass');
	});
});

describe('computeOrganizer', () => {
	const event = {
		id: 'e1',
		tiers: [
			{ id: 'a', name: 'GA', price: 10_000, sold: 60, capacity: 100 },
			{ id: 'b', name: 'VIP', price: 30_000, sold: 40, capacity: 50 }
		]
	} as EventItem;
	const tickets = [
		{ id: 't1', status: 'used' },
		{ id: 't2', status: 'used' },
		{ id: 't3', status: 'valid' }
	] as Ticket[];
	const orders = [{ id: 'o1' }, { id: 'o2' }] as Order[];

	it('computes revenue, capacity, sold %, payout and checked-in count', () => {
		const { stats } = computeOrganizer([event], tickets, orders, []);
		expect(stats.revenue).toBe(60 * 10_000 + 40 * 30_000);
		expect(stats.capacity).toBe(150);
		expect(stats.orders).toBe(100); // sold
		expect(stats.soldPct).toBe(66.7);
		expect(stats.checkedIn).toBe(2);
		expect(stats.payout).toBe(Math.round(stats.revenue * 0.35));
	});

	it('sorts check-ins newest first', () => {
		const { checkins } = computeOrganizer([event], tickets, orders, [
			{ id: 'c1', at: '2026-01-01T10:00:00Z' },
			{ id: 'c2', at: '2026-01-01T12:00:00Z' }
		] as any);
		expect(checkins.map((c) => c.id)).toEqual(['c2', 'c1']);
	});
});

describe('ticketsToCsv', () => {
	it('escapes values containing commas', () => {
		const csv = ticketsToCsv([
			{
				code: 'EV-X',
				holder: 'Obi, Ada',
				tierName: 'VIP',
				price: 30000,
				status: 'valid',
				purchasedAt: '2026-10-01T08:00:00Z',
				eventTitle: 'Rooftop'
			} as Ticket
		]);
		const [header, row] = csv.split('\n');
		expect(header).toBe('Code,Holder,Tier,Price,Status,Purchased,Event');
		expect(row).toContain('"Obi, Ada"');
	});
});

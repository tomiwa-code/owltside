import { describe, expect, it } from 'vitest';
import {
	percentChange,
	payoutAmountFor,
	settleEvent,
	settleOrganizer
} from '$lib/utils/settlement';
import type { EventItem, Ticket } from '$lib/types';

const NOW = +new Date('2026-06-01T12:00:00.000Z');
const day = 86_400_000;

const event = (overrides: Partial<EventItem> = {}) =>
	({
		id: 'e1',
		status: 'published',
		startsAt: new Date(NOW - day).toISOString(),
		endsAt: new Date(NOW + day).toISOString(),
		tiers: [
			{ id: 'ga', name: 'General', price: 12_000, sold: 10, capacity: 100 },
			{ id: 'vip', name: 'VIP', price: 30_000, sold: 2, capacity: 10 }
		],
		...overrides
	}) as EventItem;

const pass = (id: string, status: Ticket['status'], price: number, eventId = 'e1', at = NOW - day) =>
	({ id, eventId, status, price, purchasedAt: new Date(at).toISOString() }) as Ticket;

describe('settleEvent', () => {
	it('reports gross as the value of tier sales', () => {
		const settled = settleEvent(event(), [], NOW);
		expect(settled.gross).toBe(10 * 12_000 + 2 * 30_000);
		expect(settled.refunds).toBe(0);
		expect(settled.net).toBe(settled.gross);
	});

	it('holds money until the event closes, then clears it', () => {
		const running = settleEvent(event(), [], NOW);
		expect(running.held).toBe(running.net);
		expect(running.payable).toBe(0);

		const closed = settleEvent(
			event({ endsAt: new Date(NOW - day).toISOString() }),
			[],
			NOW
		);
		expect(closed.payable).toBe(closed.net);
		expect(closed.held).toBe(0);
	});

	it('deducts refunded passes but never below zero', () => {
		const settled = settleEvent(
			event(),
			[pass('t1', 'valid', 30_000), pass('t2', 'refunded', 12_000)],
			NOW
		);
		expect(settled.refunds).toBe(12_000);
		expect(settled.refunded).toBe(1);
		expect(settled.net).toBe(settled.gross - 12_000);
		expect(settled.sold).toBe(11); // 12 tier passes minus the refund

		// A refund larger than the event's sales clamps at zero instead of
		// producing a negative payout.
		const tiny = { ...event(), tiers: [{ id: 'x', name: 'X', price: 5_000, sold: 1, capacity: 5 }] };
		expect(settleEvent(tiny, [pass('t3', 'refunded', 50_000)], NOW).net).toBe(0);
	});

	it('counts passes sold in the current hour only', () => {
		const settled = settleEvent(
			event(),
			[
				pass('t1', 'valid', 12_000, 'e1', NOW - 60_000),
				pass('t2', 'valid', 12_000, 'e1', NOW - 5_000),
				pass('t3', 'valid', 12_000, 'e1', NOW - 5 * 3_600_000),
				pass('t4', 'refunded', 12_000, 'e1', NOW - 1_000)
			],
			NOW
		);
		expect(settled.soldLastHour).toBe(2);
	});

	it('reports a null delta when there is no prior period', () => {
		const settled = settleEvent(event(), [pass('t1', 'valid', 12_000, 'e1', NOW - day)], NOW);
		expect(settled.revenueDeltaPct).toBeNull();
	});

	it('compares the last 30 days with the 30 days before', () => {
		const settled = settleEvent(
			event(),
			[
				pass('t1', 'valid', 20_000, 'e1', NOW - 5 * day),
				pass('t2', 'valid', 10_000, 'e1', NOW - 45 * day)
			],
			NOW
		);
		expect(settled.revenueDeltaPct).toBe(100);
	});
});

describe('settleOrganizer', () => {
	const open = event({ id: 'open', endsAt: new Date(NOW + day).toISOString() });
	const past = event({
		id: 'past',
		status: 'closed',
		endsAt: new Date(NOW - day).toISOString(),
		tiers: [{ id: 'std', name: 'Standard', price: 8_000, sold: 5, capacity: 20 }]
	});
	const tickets = [
		pass('t1', 'valid', 12_000, 'open'),
		pass('t2', 'refunded', 30_000, 'past')
	];

	it('books each refund against its own event', () => {
		const settled = settleOrganizer([open, past], tickets, NOW);
		expect(settled.gross).toBe(open.tiers.reduce((s, t) => s + t.sold * t.price, 0) + 5 * 8_000);
		expect(settled.refunds).toBe(30_000);
		// The open event is untouched by the refund on the closed one.
		expect(settled.held).toBe(open.tiers.reduce((s, t) => s + t.sold * t.price, 0));
		expect(settled.payable).toBe(5 * 8_000 - 30_000);
	});

	it('always reconciles: payable + held = net = gross - refunds', () => {
		const settled = settleOrganizer([open, past], tickets, NOW);
		expect(settled.payable + settled.held).toBe(settled.net);
		expect(settled.net).toBe(settled.gross - settled.refunds);
	});
});

describe('payoutAmountFor', () => {
	it('is zero for a running event and the net figure once it closes', () => {
		expect(payoutAmountFor(event(), [], NOW)).toBe(0);
		expect(payoutAmountFor(event({ endsAt: new Date(NOW - day).toISOString() }), [], NOW)).toBe(
			10 * 12_000 + 2 * 30_000
		);
	});
});

describe('percentChange', () => {
	it('returns null against a zero base and rounds to one decimal', () => {
		expect(percentChange(500, 0)).toBeNull();
		expect(percentChange(150, 100)).toBe(50);
		expect(percentChange(280, 100)).toBe(180);
		expect(percentChange(100, 300)).toBe(-66.7);
	});
});

import type { EventItem, Settlement, Ticket } from '$lib/types';
import { isEventClosed } from './event-status';

/**
 * The one place organizer money is calculated.
 *
 * Every organizer surface (dashboard KPIs, the per-event manager page and the
 * payout request buttons) used to do its own arithmetic, and the payout balance
 * was a hard-coded `revenue * 0.35` that existed nowhere in the product. That is
 * why the dashboard showed ₦6,360,000 gross next to a ₦2,226,000 payout with no
 * explanation. There is no organizer commission in the product: the platform is
 * according to the server-side fee engine. Organizer earnings are the ticket
 * value less the event's configured absorbed fees and any refunds.
 *
 *   gross   = Σ sold × tier price         value of every pass sold
 *   refunds = Σ price of refunded passes  value returned to buyers
 *   net     = gross − refunds             what the organizer earned
 *   payable = net on CLOSED events        cleared, safe to withdraw
 *   held    = net on open events          released when the event closes
 *
 * `payable + held === net`, and both come from this module rather than from
 * arithmetic inside a component, so the numbers always reconcile on screen.
 */
export type { Settlement };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type SettleableEvent = Pick<EventItem, 'id' | 'status' | 'startsAt' | 'endsAt' | 'tiers'>;

const isRefunded = (ticket: Ticket) => ticket.status === 'refunded';

/** Revenue booked in `[start, end)` from pass purchase timestamps. */
function revenueBetween(tickets: Ticket[], start: number, end: number): number {
	return tickets.reduce((sum, ticket) => {
		if (isRefunded(ticket)) return sum;
		const at = +new Date(ticket.purchasedAt);
		return at >= start && at < end ? sum + ticket.price : sum;
	}, 0);
}

/**
 * Percentage change between two periods. `null` when the prior period earned
 * nothing — "up 100%" off a zero base only means "this is new".
 */
export function percentChange(current: number, prior: number): number | null {
	if (prior <= 0) return null;
	return Math.round(((current - prior) / prior) * 1000) / 10;
}

function emptySettlement(): Settlement {
	return {
		gross: 0,
		refunds: 0,
		net: 0,
		payable: 0,
		held: 0,
		sold: 0,
		refunded: 0,
		soldLastHour: 0,
		revenueDeltaPct: null
	};
}

/** Ledger for one event. Pass `tickets` for that event only. */
export function settleEvent(
	event: SettleableEvent,
	tickets: Ticket[],
	now = Date.now()
): Settlement {
	const gross = event.tiers.reduce((sum, tier) => sum + tier.sold * tier.price, 0);
	const refundedTickets = tickets.filter(isRefunded);
	const refunds = refundedTickets.reduce((sum, ticket) => sum + Math.max(0, ticket.price), 0);
	// A refund can be approved while `tier.sold` still counts the pass, so clamp:
	// refunds must never push an event's payable balance below zero.
	const net = Math.max(0, gross - refunds);
	const closed = isEventClosed(event, now);
	const refunded = refundedTickets.length;
	return {
		gross,
		refunds,
		net,
		payable: closed ? net : 0,
		held: closed ? 0 : net,
		sold: Math.max(0, event.tiers.reduce((sum, tier) => sum + tier.sold, 0) - refunded),
		refunded,
		soldLastHour: tickets.reduce((count, ticket) => {
			if (isRefunded(ticket)) return count;
			const at = +new Date(ticket.purchasedAt);
			return at >= now - HOUR_MS && at <= now ? count + 1 : count;
		}, 0),
		revenueDeltaPct: percentChange(
			revenueBetween(tickets, now - 30 * DAY_MS, now + 1),
			revenueBetween(tickets, now - 60 * DAY_MS, now - 30 * DAY_MS)
		)
	};
}

/**
 * Ledger across several events. `tickets` may span all of them — each event is
 * settled with its own passes so a refund is booked against the right event.
 */
export function settleOrganizer(
	events: SettleableEvent[],
	tickets: Ticket[],
	now = Date.now()
): Settlement {
	const byEvent = new Map<string, Ticket[]>();
	for (const ticket of tickets) {
		const bucket = byEvent.get(ticket.eventId);
		if (bucket) bucket.push(ticket);
		else byEvent.set(ticket.eventId, [ticket]);
	}

	const totals = emptySettlement();
	for (const event of events) {
		const settled = settleEvent(event, byEvent.get(event.id) ?? [], now);
		totals.gross += settled.gross;
		totals.refunds += settled.refunds;
		totals.net += settled.net;
		totals.payable += settled.payable;
		totals.held += settled.held;
		totals.sold += settled.sold;
		totals.refunded += settled.refunded;
		totals.soldLastHour += settled.soldLastHour;
	}
	totals.revenueDeltaPct = percentChange(
		revenueBetween(tickets, now - 30 * DAY_MS, now + 1),
		revenueBetween(tickets, now - 60 * DAY_MS, now - 30 * DAY_MS)
	);
	return totals;
}

/** The amount a payout request for this event should ask for. */
export function payoutAmountFor(event: SettleableEvent, tickets: Ticket[], now = Date.now()): number {
	return settleEvent(event, tickets, now).payable;
}

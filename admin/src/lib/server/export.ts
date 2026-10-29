import type {
	AdminEvent,
	AdminOrder,
	AdminOrganizer,
	AdminTicket,
	AdminUser
} from '$admin/types';
import { getSettings } from './store';
import {
	getSupabaseDashboard,
	listSupabaseEvents,
	listSupabaseOrders,
	listSupabaseOrganizers,
	listSupabaseTickets,
	listSupabaseUsers
} from './supabase-data';
import { listApprovals } from './approvals';
import { listReports } from './reports';
import { listStaff } from './store';

/** RFC-4180 safe escaping — used for every CSV the control plane emits. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
	const escape = (value: unknown) => {
		const raw = value === null || value === undefined ? '' : String(value);
		return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
	};
	const header = columns.map((column) => escape(column.label)).join(',');
	const body = rows.map((row) => columns.map((column) => escape(row[column.key])).join(','));
	return [header, ...body].join('\r\n');
}

const naira = (value: number) => (value / 1).toFixed(2);

async function eventRows(): Promise<Record<string, unknown>[]> {
	const result = await listSupabaseEvents({ perPage: 1000 });
	return result.rows.map((event: AdminEvent) => ({
		ref: event.ref,
		title: event.title,
		organizer: event.organizerName,
		category: event.category,
		status: event.status,
		starts_at: event.startsAt,
		venue: event.venue,
		city: event.city,
		capacity: event.capacity,
		sold: event.sold,
		gross_ngn: naira(event.grossNgn)
	}));
}

async function organizerRows(): Promise<Record<string, unknown>[]> {
	const result = await listSupabaseOrganizers({ perPage: 1000 });
	return result.page.rows.map((org: AdminOrganizer) => ({
		id: org.id,
		name: org.name,
		legal_name: org.legalName,
		cac: org.cacRegNumber,
		status: org.status,
		tier: org.tier,
		city: org.city,
		events: org.eventsCount,
		tickets_sold: org.ticketsSold,
		gross_volume_ngn: naira(org.grossVolumeNgn),
		escrow_ngn: naira(org.escrowHeldNgn),
		settlement_state: org.settlementState,
		risk: org.risk
	}));
}

async function userRows(): Promise<Record<string, unknown>[]> {
	const result = await listSupabaseUsers({ perPage: 1000 });
	return result.page.rows.map((user: AdminUser) => ({
		id: user.id,
		name: user.name,
		handle: user.handle,
		email: user.email,
		phone: user.phone,
		role: user.role,
		kyc_tier: user.kycTier,
		status: user.status,
		city: user.city,
		tickets: user.ticketsCount,
		orders: user.ordersCount,
		spend_ngn: naira(user.spendNgn),
		joined_at: user.joinedAt,
		last_seen_at: user.lastSeenAt
	}));
}

async function ticketRows(): Promise<Record<string, unknown>[]> {
	const result = await listSupabaseTickets({ perPage: 1000 });
	return result.page.rows.map((ticket: AdminTicket) => ({
		code: ticket.code,
		holder: ticket.holderName,
		handle: ticket.holderHandle,
		event: ticket.eventTitle,
		tier: ticket.tierName,
		seat: ticket.seat ?? '',
		status: ticket.status,
		settlement: ticket.settlement,
		order_ref: ticket.orderRef,
		price_ngn: naira(ticket.priceNgn),
		purchased_at: ticket.purchasedAt,
		reissues: ticket.reissueCount ?? 0
	}));
}

async function orderRows(): Promise<Record<string, unknown>[]> {
	const result = await listSupabaseOrders({ perPage: 1000 });
	return result.page.rows.map((order: AdminOrder) => ({
		reference: order.reference,
		customer: order.customerName,
		email: order.customerEmail,
		event: order.eventTitle,
		tier: order.tierLabel,
		qty: order.qty,
		subtotal_ngn: naira(order.subtotalNgn),
		fee_ngn: naira(order.feeNgn),
		total_ngn: naira(order.totalNgn),
		gateway: order.gateway,
		method: order.method,
		status: order.status,
		created_at: order.createdAt,
		settled_at: order.settledAt ?? ''
	}));
}

async function approvalRows(): Promise<Record<string, unknown>[]> {
	const { rows } = await listApprovals();
	return rows.map((a) => ({
		ref: a.id,
		kind: a.kind,
		title: a.title,
		requester: a.requesterHandle,
		amount_ngn: a.amountNgn !== undefined ? naira(a.amountNgn) : '',
		status: a.status,
		requested_at: a.requestedAt,
		decided_at: a.decidedAt ?? '',
		decided_by: a.decidedBy ?? ''
	}));
}

async function reportRows(): Promise<Record<string, unknown>[]> {
	const { rows } = await listReports();
	return rows.map((r) => ({
		ref: r.id,
		target_type: r.targetType,
		target_label: r.targetLabel,
		category: r.categoryLabel,
		reporter: r.reporterHandle,
		status: r.status,
		created_at: r.createdAt,
		reviewed_at: r.reviewedAt ?? ''
	}));
}

function staffRows(): Record<string, unknown>[] {
	return listStaff().map((member) => ({
		id: member.id,
		name: member.name,
		email: member.email,
		role: member.role,
		tier: member.tier,
		auth: member.auth,
		status: member.status,
		sessions: member.sessions,
		location: member.location,
		last_active: member.lastActive
	}));
}

async function dashboardRows(): Promise<Record<string, unknown>[]> {
	const dashboard = await getSupabaseDashboard();
	return [
		{ metric: 'gross_revenue_ngn', value: naira(dashboard.grossNgn) },
		{ metric: 'net_revenue_ngn', value: naira(dashboard.netNgn) },
		{ metric: 'passes_minted', value: dashboard.passes },
		{ metric: 'live_events', value: dashboard.liveEvents },
		{ metric: 'events_today', value: dashboard.eventsToday },
		{ metric: 'pending_review', value: dashboard.pendingReview },
		{ metric: 'active_passes', value: dashboard.activePasses },
		{ metric: 'refunds_pending', value: dashboard.refundsPending },
		{ metric: 'moderation_open', value: dashboard.moderationOpen }
	];
}

type Report = { label: string; filename: string; columns: { key: string; label: string }[]; rows: () => Promise<Record<string, unknown>[]> | Record<string, unknown>[] };

const makeReport = (r: Omit<Report, 'rows'> & { rows: () => Promise<Record<string, unknown>[]> | Record<string, unknown>[] }): Report => r;

export const REPORTS: Record<string, Report> = {
	dashboard: makeReport({
		label: 'Dashboard executive brief',
		filename: 'owltside-dashboard.csv',
		columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }],
		rows: dashboardRows
	}),
	events: makeReport({
		label: 'Event roster',
		filename: 'owltside-events.csv',
		columns: [
			{ key: 'ref', label: 'Ref' }, { key: 'title', label: 'Title' }, { key: 'organizer', label: 'Organizer' },
			{ key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }, { key: 'starts_at', label: 'Starts at' },
			{ key: 'venue', label: 'Venue' }, { key: 'city', label: 'City' }, { key: 'capacity', label: 'Capacity' },
			{ key: 'sold', label: 'Sold' }, { key: 'gross_ngn', label: 'Gross NGN' }
		],
		rows: eventRows
	}),
	organizers: makeReport({
		label: 'Organizer registry',
		filename: 'owltside-organizers.csv',
		columns: [
			{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'legal_name', label: 'Legal name' },
			{ key: 'cac', label: 'CAC' }, { key: 'status', label: 'Status' }, { key: 'tier', label: 'Tier' },
			{ key: 'city', label: 'City' }, { key: 'events', label: 'Events' }, { key: 'tickets_sold', label: 'Tickets sold' },
			{ key: 'gross_volume_ngn', label: 'Gross volume NGN' }, { key: 'escrow_ngn', label: 'Escrow NGN' },
			{ key: 'settlement_state', label: 'Settlement' }, { key: 'risk', label: 'Risk' }
		],
		rows: organizerRows
	}),
	users: makeReport({
		label: 'User roster',
		filename: 'owltside-users.csv',
		columns: [
			{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'handle', label: 'Handle' },
			{ key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'role', label: 'Role' },
			{ key: 'kyc_tier', label: 'KYC tier' }, { key: 'status', label: 'Status' }, { key: 'city', label: 'City' },
			{ key: 'tickets', label: 'Tickets' }, { key: 'orders', label: 'Orders' }, { key: 'spend_ngn', label: 'Spend NGN' },
			{ key: 'joined_at', label: 'Joined' }, { key: 'last_seen_at', label: 'Last seen' }
		],
		rows: userRows
	}),
	tickets: makeReport({
		label: 'Ticket manifest',
		filename: 'owltside-tickets.csv',
		columns: [
			{ key: 'code', label: 'Code' }, { key: 'holder', label: 'Holder' }, { key: 'handle', label: 'Handle' },
			{ key: 'event', label: 'Event' }, { key: 'tier', label: 'Tier' }, { key: 'seat', label: 'Seat' },
			{ key: 'status', label: 'Status' }, { key: 'settlement', label: 'Settlement' }, { key: 'order_ref', label: 'Order' },
			{ key: 'price_ngn', label: 'Price NGN' }, { key: 'purchased_at', label: 'Purchased' },
			{ key: 'reissues', label: 'Re-issues' }
		],
		rows: ticketRows
	}),
	orders: makeReport({
		label: 'Transaction ledger',
		filename: 'owltside-orders.csv',
		columns: [
			{ key: 'reference', label: 'Reference' }, { key: 'customer', label: 'Customer' }, { key: 'email', label: 'Email' },
			{ key: 'event', label: 'Event' }, { key: 'tier', label: 'Tier' }, { key: 'qty', label: 'Qty' },
			{ key: 'subtotal_ngn', label: 'Subtotal NGN' }, { key: 'fee_ngn', label: 'Fee NGN' },
			{ key: 'total_ngn', label: 'Total NGN' }, { key: 'gateway', label: 'Gateway' }, { key: 'method', label: 'Method' },
			{ key: 'status', label: 'Status' }, { key: 'created_at', label: 'Created' }, { key: 'settled_at', label: 'Settled' }
		],
		rows: orderRows
	}),
	approvals: makeReport({
		label: 'Approval queue',
		filename: 'owltside-approvals.csv',
		columns: [
			{ key: 'ref', label: 'ID' }, { key: 'kind', label: 'Kind' }, { key: 'title', label: 'Title' },
			{ key: 'requester', label: 'Requester' }, { key: 'amount_ngn', label: 'Amount NGN' },
			{ key: 'status', label: 'Status' }, { key: 'requested_at', label: 'Requested' },
			{ key: 'decided_at', label: 'Decided' }, { key: 'decided_by', label: 'Decided by' }
		],
		rows: approvalRows
	}),
	reports: makeReport({
		label: 'Content reports',
		filename: 'owltside-reports.csv',
		columns: [
			{ key: 'ref', label: 'ID' }, { key: 'target_type', label: 'Target type' }, { key: 'target_label', label: 'Target' },
			{ key: 'category', label: 'Category' }, { key: 'reporter', label: 'Reporter' }, { key: 'status', label: 'Status' },
			{ key: 'created_at', label: 'Created' }, { key: 'reviewed_at', label: 'Reviewed' }
		],
		rows: reportRows
	}),
	staff: makeReport({
		label: 'Administrator manifest',
		filename: 'owltside-staff.csv',
		columns: [
			{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
			{ key: 'role', label: 'Role' }, { key: 'tier', label: 'Tier' }, { key: 'auth', label: 'Auth' },
			{ key: 'status', label: 'Status' }, { key: 'sessions', label: 'Sessions' }, { key: 'location', label: 'Location' },
			{ key: 'last_active', label: 'Last active' }
		],
		rows: staffRows
	})
};

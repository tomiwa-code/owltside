import type {
	AdminCase,
	AdminEvent,
	AdminOrder,
	AdminOrganizer,
	AdminRefund,
	AdminStaff,
	AdminTicket,
	AdminUser,
	AuditRecord
} from '$admin/types';
import {
	getSettlements,
	getSettings,
	listAudit,
	listCases,
	listEvents,
	listOrders,
	listOrganizers,
	listStaff,
	listTickets,
	listUsers,
	getRefundsData,
	getDashboard
} from './store';

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

function eventRows(): Record<string, unknown>[] {
	return listEvents({ perPage: 100 }).rows.map((event: AdminEvent) => ({
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

function organizerRows(): Record<string, unknown>[] {
	return listOrganizers({ perPage: 100 }).rows.map((org: AdminOrganizer) => ({
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

function userRows(): Record<string, unknown>[] {
	return listUsers({ perPage: 100 }).rows.map((user: AdminUser) => ({
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

function ticketRows(): Record<string, unknown>[] {
	return listTickets({ perPage: 100 }).rows.map((ticket: AdminTicket) => ({
		code: ticket.code,
		holder: ticket.holderName,
		handle: ticket.holderHandle,
		event: ticket.eventTitle,
		tier: ticket.tierName,
		seat: ticket.seat,
		status: ticket.status,
		settlement: ticket.settlement,
		order_ref: ticket.orderRef,
		price_ngn: naira(ticket.priceNgn),
		purchased_at: ticket.purchasedAt,
		reissues: ticket.reissueCount ?? 0
	}));
}

function orderRows(): Record<string, unknown>[] {
	return listOrders({ perPage: 100 }).rows.map((order: AdminOrder) => ({
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

function refundRows(): Record<string, unknown>[] {
	return getRefundsData().rows.map((refund: AdminRefund) => ({
		ref: refund.id,
		order_ref: refund.orderRef,
		customer: refund.customerName,
		event: refund.eventTitle,
		amount_ngn: naira(refund.amountNgn),
		original_ngn: naira(refund.originalNgn),
		status: refund.status,
		policy_match: refund.policyMatch,
		reason: refund.reason,
		requested_at: refund.requestedAt,
		decided_at: refund.decidedAt ?? '',
		decided_by: refund.decidedBy ?? ''
	}));
}

function moderationRows(): Record<string, unknown>[] {
	return listCases({}).map((item: AdminCase) => ({
		ref: item.ref,
		title: item.title,
		category: item.category,
		severity: item.severity,
		status: item.status,
		target: item.target,
		reported_by: item.reportedBy,
		exposure_ngn: naira(item.exposureNgn),
		escrow_ngn: naira(item.escrowNgn),
		created_at: item.createdAt,
		resolved_at: item.resolvedAt ?? ''
	}));
}

function auditRows(): Record<string, unknown>[] {
	return listAudit({ perPage: 100 }).rows.map((record: AuditRecord) => ({
		ref: record.ref,
		at: record.at,
		actor: record.actor,
		role: record.actorRole,
		action: record.action,
		target: record.target,
		reason: record.reason,
		severity: record.severity,
		entity_kind: record.entityKind,
		entity_id: record.entityId,
		ip: record.ip,
		hash: record.hash,
		prev_hash: record.prevHash
	}));
}

function staffRows(): Record<string, unknown>[] {
	return listStaff().map((member: AdminStaff) => ({
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

function settlementRows(): Record<string, unknown>[] {
	return getSettlements().rows.map((row) => ({
		organizer_id: row.organizerId,
		name: row.name,
		events: row.events,
		tickets: row.tickets,
		gmv_ngn: naira(row.gmvNgn),
		fee_ngn: naira(row.feeNgn),
		payout_ngn: naira(row.payoutNgn),
		state: row.state,
		bank: row.bank,
		account_last4: row.accountLast4
	}));
}

function dashboardRows(): Record<string, unknown>[] {
	const dashboard = getDashboard();
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

function overviewRows(): Record<string, unknown>[] {
	const settings = getSettings();
	const settlements = getSettlements();
	const dashboard = getDashboard();
	return [
		{ section: 'treasury', metric: 'gross_gmv_ngn', value: naira(settlements.grossNgn), note: `${settlements.settledPct}% settled` },
		{ section: 'treasury', metric: 'escrow_held_ngn', value: naira(settlements.escrowNgn), note: `${settlements.escrowEvents} events queued` },
		{ section: 'treasury', metric: 'commission_ngn', value: naira(settlements.commissionNgn), note: `${settings.platformFeePct}% take rate` },
		{ section: 'operations', metric: 'passes_minted', value: dashboard.passes, note: `${dashboard.activePasses} active` },
		{ section: 'operations', metric: 'live_events', value: dashboard.liveEvents, note: `${dashboard.pendingReview} awaiting review` },
		{ section: 'risk', metric: 'refunds_pending', value: dashboard.refundsPending, note: `${settings.firmware}` },
		{ section: 'risk', metric: 'moderation_open', value: dashboard.moderationOpen, note: settings.lastAudit }
	];
}

export const REPORTS: Record<string, { label: string; filename: string; columns: { key: string; label: string }[]; rows: () => Record<string, unknown>[] }> = {
	dashboard: {
		label: 'Dashboard executive brief',
		filename: 'owltside-dashboard.csv',
		columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }],
		rows: dashboardRows
	},
	overview: {
		label: 'Platform overview',
		filename: 'owltside-overview.csv',
		columns: [{ key: 'section', label: 'Section' }, { key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }, { key: 'note', label: 'Note' }],
		rows: overviewRows
	},
	events: {
		label: 'Event roster',
		filename: 'owltside-events.csv',
		columns: [
			{ key: 'ref', label: 'Ref' }, { key: 'title', label: 'Title' }, { key: 'organizer', label: 'Organizer' },
			{ key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }, { key: 'starts_at', label: 'Starts at' },
			{ key: 'venue', label: 'Venue' }, { key: 'city', label: 'City' }, { key: 'capacity', label: 'Capacity' },
			{ key: 'sold', label: 'Sold' }, { key: 'gross_ngn', label: 'Gross NGN' }
		],
		rows: eventRows
	},
	organizers: {
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
	},
	users: {
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
	},
	tickets: {
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
	},
	orders: {
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
	},
	refunds: {
		label: 'Refund ledger',
		filename: 'owltside-refunds.csv',
		columns: [
			{ key: 'ref', label: 'Ref' }, { key: 'order_ref', label: 'Order' }, { key: 'customer', label: 'Customer' },
			{ key: 'event', label: 'Event' }, { key: 'amount_ngn', label: 'Amount NGN' },
			{ key: 'original_ngn', label: 'Original NGN' }, { key: 'status', label: 'Status' },
			{ key: 'policy_match', label: 'Policy match' }, { key: 'reason', label: 'Reason' },
			{ key: 'requested_at', label: 'Requested' }, { key: 'decided_at', label: 'Decided' }, { key: 'decided_by', label: 'Decided by' }
		],
		rows: refundRows
	},
	moderation: {
		label: 'Incident report',
		filename: 'owltside-moderation.csv',
		columns: [
			{ key: 'ref', label: 'Ref' }, { key: 'title', label: 'Title' }, { key: 'category', label: 'Category' },
			{ key: 'severity', label: 'Severity' }, { key: 'status', label: 'Status' }, { key: 'target', label: 'Target' },
			{ key: 'reported_by', label: 'Reported by' }, { key: 'exposure_ngn', label: 'Exposure NGN' },
			{ key: 'escrow_ngn', label: 'Escrow NGN' }, { key: 'created_at', label: 'Created' }, { key: 'resolved_at', label: 'Resolved' }
		],
		rows: moderationRows
	},
	audit: {
		label: 'Audit ledger',
		filename: 'owltside-audit.csv',
		columns: [
			{ key: 'ref', label: 'Ref' }, { key: 'at', label: 'Timestamp' }, { key: 'actor', label: 'Actor' },
			{ key: 'role', label: 'Role' }, { key: 'action', label: 'Action' }, { key: 'target', label: 'Target' },
			{ key: 'reason', label: 'Reason' }, { key: 'severity', label: 'Severity' }, { key: 'entity_kind', label: 'Entity kind' },
			{ key: 'entity_id', label: 'Entity ID' }, { key: 'ip', label: 'IP' }, { key: 'hash', label: 'Hash' }, { key: 'prev_hash', label: 'Prev hash' }
		],
		rows: auditRows
	},
	staff: {
		label: 'Administrator manifest',
		filename: 'owltside-staff.csv',
		columns: [
			{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
			{ key: 'role', label: 'Role' }, { key: 'tier', label: 'Tier' }, { key: 'auth', label: 'Auth' },
			{ key: 'status', label: 'Status' }, { key: 'sessions', label: 'Sessions' }, { key: 'location', label: 'Location' },
			{ key: 'last_active', label: 'Last active' }
		],
		rows: staffRows
	},
	settlements: {
		label: 'Settlement statement',
		filename: 'owltside-settlements.csv',
		columns: [
			{ key: 'organizer_id', label: 'Organizer ID' }, { key: 'name', label: 'Name' }, { key: 'events', label: 'Events' },
			{ key: 'tickets', label: 'Tickets' }, { key: 'gmv_ngn', label: 'GMV NGN' }, { key: 'fee_ngn', label: 'Fee NGN' },
			{ key: 'payout_ngn', label: 'Payout NGN' }, { key: 'state', label: 'State' }, { key: 'bank', label: 'Bank' },
			{ key: 'account_last4', label: 'Account last 4' }
		],
		rows: settlementRows
	},
};

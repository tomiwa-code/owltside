import { listApprovals } from './approvals';
import { listReports } from './reports';
import { createAdminClient } from './supabase-data';
import { hasAdminEventEnded } from '$admin/utils/status';
import type { AdminNotificationItem, AdminNotificationKind } from '$admin/types';

export interface AdminNotificationsBundle {
	actionableCount: number;
	counts: {
		all: number;
		actionable: number;
		approvals: number;
		refunds: number;
		payouts: number;
		verifications: number;
		reports: number;
		events: number;
		orders: number;
	};
	items: AdminNotificationItem[];
}

export async function listAdminNotifications(limit = 100): Promise<AdminNotificationsBundle> {
	const items: AdminNotificationItem[] = [];

	const [approvalsRes, reportsRes, eventsAndOrdersRes] = await Promise.all([
		listApprovals().catch(() => ({ rows: [] })),
		listReports().catch(() => ({ rows: [] })),
		(async () => {
			try {
				const client = createAdminClient();
				const [eventsQuery, ordersQuery] = await Promise.all([
					client
						.from('events')
						.select('id,title,venue,city,status,starts_at,ends_at,submitted_at,created_at,organizer:profiles(name,handle)')
						.in('status', ['pending', 'suspended', 'rejected', 'published'])
						.order('created_at', { ascending: false })
						.limit(60),
					client
						.from('orders')
						.select('id,reference,owner_name,items_label,total,status,created_at')
						.order('created_at', { ascending: false })
						.limit(30)
				]);
				return {
					events: (eventsQuery.data ?? []) as Record<string, any>[],
					orders: (ordersQuery.data ?? []) as Record<string, any>[]
				};
			} catch {
				return { events: [], orders: [] };
			}
		})()
	]);

	for (const row of approvalsRes.rows) {
		const kind: AdminNotificationKind =
			row.kind === 'refund'
				? 'refund'
				: row.kind === 'payout'
					? 'payout'
					: 'verification';
		const href = row.kind === 'refund' ? '/refunds' : '/approvals';
		const actor = row.requesterEmail
			? `${row.requesterName} (${row.requesterEmail})`
			: row.requesterHandle && row.requesterHandle !== '—'
				? `${row.requesterName} (@${row.requesterHandle})`
				: row.requesterName;

		items.push({
			id: `apr:${row.id}`,
			kind,
			title: row.title,
			body: row.summary || `${row.kind} request submitted by ${actor}`,
			actor,
			status: row.status,
			actionable: row.status === 'pending',
			createdAt: row.requestedAt,
			href
		});
	}

	for (const report of reportsRes.rows) {
		const actor = report.reporterEmail
			? `${report.reporterName} (${report.reporterEmail})`
			: `${report.reporterName}${report.reporterHandle && report.reporterHandle !== '—' ? ` (@${report.reporterHandle})` : ''}`;
		items.push({
			id: `rpt:${report.id}`,
			kind: 'report',
			title: `Report · ${report.targetLabel} (${report.categoryLabel})`,
			body: report.details || `${report.targetType === 'event' ? 'Event listing' : 'Public profile'} flagged as ${report.categoryLabel}`,
			actor,
			status: report.status,
			actionable: report.status === 'open',
			createdAt: report.createdAt,
			href: '/reports'
		});
	}

	for (const ev of eventsAndOrdersRes.events) {
		const rawStatus = String(ev.status ?? 'pending');
		// Show all pending/suspended/rejected events, plus recently submitted published/closed events
		if (rawStatus === 'published' && !ev.submitted_at) continue;
		const status =
			rawStatus === 'published' && hasAdminEventEnded(ev.starts_at, ev.ends_at)
				? 'closed'
				: rawStatus;
		const org = (ev.organizer ?? {}) as Record<string, any>;
		const actor = org?.name
			? `${org.name}${org.handle ? ` (@${org.handle})` : ''}`
			: org?.handle
				? `@${org.handle}`
				: 'Organizer';
		items.push({
			id: `evt:${ev.id}`,
			kind: 'event',
			title:
				status === 'pending'
					? `Event submission · ${ev.title}`
					: `Event (${status}) · ${ev.title}`,
			body: `${[ev.venue, ev.city].filter(Boolean).join(', ') || 'Venue'} · Submitted by ${actor}`,
			actor,
			status,
			actionable: status === 'pending',
			createdAt: String(ev.submitted_at ?? ev.created_at ?? new Date().toISOString()),
			href: status === 'pending' ? '/moderation' : `/events/${ev.id}`
		});
	}

	for (const order of eventsAndOrdersRes.orders) {
		const status = String(order.status ?? 'paid');
		const total = Number(order.total ?? 0);
		items.push({
			id: `ord:${order.id}`,
			kind: 'order',
			title: `Order ${order.reference ?? String(order.id).slice(0, 8)} · ₦${total.toLocaleString('en-NG')}`,
			body: `${order.items_label ?? 'Ticket order'} by ${order.owner_name ?? 'Attendee'}`,
			actor: String(order.owner_name ?? 'Attendee'),
			status,
			actionable: status === 'pending',
			createdAt: String(order.created_at ?? new Date().toISOString()),
			href: '/orders'
		});
	}

	// Sort actionable items first by newest, then non-actionable items by newest
	items.sort((a, b) => {
		if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
		return b.createdAt.localeCompare(a.createdAt);
	});

	const actionableItems = items.filter((item) => item.actionable);
	const counts = {
		all: items.length,
		actionable: actionableItems.length,
		approvals: items.filter((i) =>
			['verification', 'payout', 'refund', 'approval'].includes(i.kind)
		).length,
		refunds: items.filter((i) => i.kind === 'refund').length,
		payouts: items.filter((i) => i.kind === 'payout').length,
		verifications: items.filter((i) => i.kind === 'verification').length,
		reports: items.filter((i) => i.kind === 'report').length,
		events: items.filter((i) => i.kind === 'event').length,
		orders: items.filter((i) => i.kind === 'order').length
	};

	return {
		actionableCount: actionableItems.length,
		counts,
		items: items.slice(0, limit)
	};
}

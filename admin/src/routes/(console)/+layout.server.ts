import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { listSupabaseEvents } from '$admin/server/supabase-data';
import { pendingApprovalCount } from '$admin/server/approvals';
import { countOpenReports } from '$admin/server/reports';
import { listSubmissions } from '$admin/server/moderation';
import { listAdminNotifications } from '$admin/server/notifications';

const emptyEventCounts = { total: 0, published: 0, pending: 0, draft: 0, suspended: 0 };

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	if (!locals.admin) redirect(303, '/login');
	const { admin, mode } = await parent();

	const [eventsResult, approvalsCount, reportsCount, submissions, notificationBundle] =
		await Promise.all([
			listSupabaseEvents({ page: 1, perPage: 1 }).catch(() => ({
				counts: emptyEventCounts
			})),
			pendingApprovalCount().catch(() => 0),
			countOpenReports().catch(() => 0),
			listSubmissions().catch(() => []),
			listAdminNotifications(30).catch(() => ({
				actionableCount: 0,
				counts: {
					all: 0,
					actionable: 0,
					approvals: 0,
					refunds: 0,
					payouts: 0,
					verifications: 0,
					reports: 0,
					events: 0,
					orders: 0
				},
				items: []
			}))
		]);

	const pendingRefunds = notificationBundle.items.filter(
		(item) => item.kind === 'refund' && item.actionable
	).length;

	return {
		admin,
		mode,
		notifications: notificationBundle.items,
		counts: {
			pendingEvents: eventsResult.counts.pending,
			refunds: pendingRefunds,
			approvals: approvalsCount,
			reports: reportsCount,
			moderation: submissions.length,
			notifications: notificationBundle.actionableCount
		},
		serverTime: new Date().toISOString(),
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

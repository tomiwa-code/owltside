import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { listSupabaseEvents } from '$admin/server/supabase-data';
import { pendingApprovalCount } from '$admin/server/approvals';
import { countOpenReports } from '$admin/server/reports';
import { listSubmissions } from '$admin/server/moderation';

const emptyEventCounts = { total: 0, published: 0, pending: 0, draft: 0, suspended: 0 };

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	if (!locals.admin) redirect(303, '/login');
	const { admin, mode } = await parent();

	const [eventsResult, approvalsCount, reportsCount, submissions] = await Promise.all([
		listSupabaseEvents({ page: 1, perPage: 1 }).catch(() => ({
			counts: emptyEventCounts
		})),
		pendingApprovalCount().catch(() => 0),
		countOpenReports().catch(() => 0),
		listSubmissions().catch(() => [])
	]);

	return {
		admin,
		mode,
		counts: {
			pendingEvents: eventsResult.counts.pending,
			refunds: 0,
			approvals: approvalsCount,
			reports: reportsCount,
			moderation: submissions.length
		},
		serverTime: new Date().toISOString(),
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

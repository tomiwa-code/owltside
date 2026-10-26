import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countCases, countEvents, countReports, getRefundsData } from '$admin/server/store';
import { listApprovals, pendingApprovalCount } from '$admin/server/approvals';
import { listReports } from '$admin/server/reports';
import { listSubmissions } from '$admin/server/moderation';
import { adminDataSource, supabaseNotice } from '$admin/server/supabase-data';

/** Never let a sidebar badge take the whole console down. */
async function quietly<T>(run: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await run();
	} catch {
		return fallback;
	}
}

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	if (!locals.admin) redirect(303, '/login');
	const { admin, mode } = await parent();
	const source = adminDataSource();

	let counts = { pendingEvents: 0, refunds: 0, approvals: 0, reports: 0, moderation: 0 };

	if (source === 'demo') {
		counts = {
			pendingEvents: countEvents().pending,
			refunds: getRefundsData().pending,
			approvals: pendingApprovalCount(),
			reports: countReports(),
			moderation: countCases().open
		};
	} else {
		// Live mode: badges must count the real queues, and each one is optional —
		// a project that has not applied 023/025 yet keeps working, just without
		// that badge, instead of failing every console page with a 500.
		const [pendingEvents, approvalRows, reportRows] = await Promise.all([
			quietly(() => listSubmissions().then((rows) => rows.length), 0),
			quietly(() => listApprovals().then((result) => result.rows), []),
			quietly(() => listReports().then((result) => result.rows), [])
		]);
		counts = {
			pendingEvents,
			approvals: approvalRows.filter((row) => row.status === 'pending').length,
			refunds: approvalRows.filter((row) => row.status === 'pending' && row.kind === 'refund').length,
			reports: reportRows.filter((row) => row.status === 'open').length,
			moderation: 0
		};
	}

	return {
		admin,
		mode,
		counts,
		// Empty when Supabase is either correctly configured or deliberately absent.
		supabaseNotice: supabaseNotice(),
		serverTime: new Date().toISOString(),
		// The admin console is a separate deployment; this is the link back to the
		// customer-facing Owltside app it governs.
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

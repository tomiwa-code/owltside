import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countCases, countEvents, getRefundsData } from '$admin/server/store';
import { pendingApprovalCount } from '$admin/server/approvals';
import { countReports } from '$admin/server/store';

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	if (!locals.admin) redirect(303, '/login');
	const { admin } = await parent();
	const refunds = getRefundsData();
	const cases = countCases();

	return {
		admin,
		counts: {
			pendingEvents: countEvents().pending,
			refunds: refunds.pending,
			approvals: pendingApprovalCount(),
			reports: countReports(),
			moderation: cases.open
		},
		serverTime: new Date().toISOString(),
		// The admin console is a separate deployment; this is the link back to the
		// customer-facing Owltside app it governs.
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

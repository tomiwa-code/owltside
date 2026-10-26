import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countCases, countEvents, getRefundsData } from '$admin/server/store';
import { adminDataSource } from '$admin/server/supabase-data';

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	if (!locals.admin) redirect(303, '/login');
	const { admin, mode } = await parent();
	const source = adminDataSource();
	const refunds = source === 'demo' ? getRefundsData() : null;
	const cases = source === 'demo' ? countCases() : null;

	return {
		admin,
		mode,
		counts: {
			// The customer app's public.events schema has no moderation status column.
			pendingEvents: source === 'supabase' ? 0 : countEvents().pending,
			refunds: refunds?.pending ?? 0,
			moderation: cases?.open ?? 0
		},
		serverTime: new Date().toISOString(),
		// The admin console is a separate deployment; this is the link back to the
		// customer-facing Owltside app it governs.
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

import type { PageServerLoad } from './$types';
import { getDashboard } from '$admin/server/store';
import { adminDataSource, getSupabaseDashboard, liveFailure } from '$admin/server/supabase-data';

export const load: PageServerLoad = async () => {
	const source = adminDataSource();
	if (source !== 'supabase') return { dashboard: getDashboard(), source };

	let dashboard: Awaited<ReturnType<typeof getSupabaseDashboard>>;
	try {
		dashboard = await getSupabaseDashboard();
	} catch (cause) {
		liveFailure('dashboard metrics', cause);
	}
	return { dashboard, source };
};

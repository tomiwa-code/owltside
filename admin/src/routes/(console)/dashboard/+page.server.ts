import type { PageServerLoad } from './$types';
import { getDashboard } from '$admin/server/store';
import { adminDataSource, getSupabaseDashboard } from '$admin/server/supabase-data';

export const load: PageServerLoad = async () => {
	const source = adminDataSource();
	if (source === 'supabase') {
		try {
			return { dashboard: await getSupabaseDashboard(), source };
		} catch (cause) {
			// A mis-configured or unreachable Supabase project must not take the
			// whole console down — surface demo metrics and let the UI explain
			// the live source is unavailable, mirroring the resilient pattern used
			// on approvals/reports/moderation.
			console.error('[dashboard] live Supabase fetch failed, falling back to demo snapshot:', cause);
			return { dashboard: getDashboard(), source: 'demo' as const, liveError: cause instanceof Error ? cause.message : 'Live metrics unavailable.' };
		}
	}
	return { dashboard: getDashboard(), source };
};

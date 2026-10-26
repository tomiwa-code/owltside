import type { PageServerLoad } from './$types';
import { getDashboard } from '$admin/server/store';
import { adminDataSource, getSupabaseDashboard } from '$admin/server/supabase-data';

export const load: PageServerLoad = async () => {
	const source = adminDataSource();
	return {
		dashboard: source === 'supabase' ? await getSupabaseDashboard() : getDashboard(),
		source
	};
};

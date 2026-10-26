// @ts-nocheck
import type { PageServerLoad } from './$types';
import { getDashboard } from '$admin/server/store';
import { adminDataSource, getSupabaseDashboard } from '$admin/server/supabase-data';

export const load = async () => {
	const source = adminDataSource();
	return {
		dashboard: source === 'supabase' ? await getSupabaseDashboard() : getDashboard(),
		source
	};
};
;null as any as PageServerLoad;
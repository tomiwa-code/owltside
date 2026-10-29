import type { PageServerLoad } from './$types';
import { getSupabaseDashboard } from '$admin/server/supabase-data';

export const load: PageServerLoad = async () => {
	return { dashboard: await getSupabaseDashboard(), source: 'supabase' as const };
};

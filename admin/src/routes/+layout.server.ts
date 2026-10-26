import type { LayoutServerLoad } from './$types';
import { adminDataSource } from '$admin/server/supabase-data';

export const load: LayoutServerLoad = ({ locals }) => ({
	admin: locals.admin,
	mode: adminDataSource() === 'supabase' ? ('live' as const) : ('demo' as const)
});

// @ts-nocheck
import type { LayoutServerLoad } from './$types';
import { adminDataSource } from '$admin/server/supabase-data';

export const load = ({ locals }: Parameters<LayoutServerLoad>[0]) => ({
	admin: locals.admin,
	mode: adminDataSource() === 'supabase' ? ('live' as const) : ('demo' as const)
});

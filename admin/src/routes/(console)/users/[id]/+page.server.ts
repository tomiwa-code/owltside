import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSupabaseUser } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const live = await getSupabaseUser(params.id);
	if (!live) error(404, 'User not found.');
	return { ...live, audit: [], source: 'supabase' as const };
};

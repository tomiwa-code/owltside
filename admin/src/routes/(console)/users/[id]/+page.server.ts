import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSupabaseUser } from '$admin/server/supabase-data';
import { auditFor } from '$admin/server/store';

export const load: PageServerLoad = async ({ params }) => {
	const live = await getSupabaseUser(params.id);
	if (!live) error(404, 'User not found.');
	return { ...live, audit: auditFor(live.user.id, 10), source: 'supabase' as const };
};

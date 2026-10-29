import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSupabaseOrganizer } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const live = await getSupabaseOrganizer(params.id);
	if (!live) error(404, 'Organizer profile not found.');
	return { organizer: live.organizer, events: live.events, orders: [], audit: [], source: 'supabase' as const };
};

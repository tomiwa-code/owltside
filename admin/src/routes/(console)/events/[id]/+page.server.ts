import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSupabaseEvent } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const event = await getSupabaseEvent(params.id);
	if (!event) error(404, 'Event not found');
	return {
		event,
		orders: [],
		tickets: [],
		audit: [],
		source: 'supabase' as const,
		publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'
	};
};

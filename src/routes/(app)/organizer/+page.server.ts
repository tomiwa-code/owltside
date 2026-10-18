import { computeOrganizer, getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const payload = await getSource(createSupabase(cookies))
		.getOrganizer(locals.session?.userId ?? 'demo')
		.catch(() => computeOrganizer([], [], [], []));
	return { payload };
};

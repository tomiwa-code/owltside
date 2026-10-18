import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const tickets = await getSource(createSupabase(cookies)).getTickets(locals.session?.userId ?? 'demo').catch(() => []);
	return { tickets };
};

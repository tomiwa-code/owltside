import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const [tickets, profile] = await Promise.all([
		source.getTickets(userId),
		locals.session ? source.getProfile(locals.session.handle) : Promise.resolve(undefined)
	]);
	return { tickets, profile: profile ?? null };
};

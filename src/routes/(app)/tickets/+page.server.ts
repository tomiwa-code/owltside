import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	/* Unregistered visitors are asked to sign in (the page renders the
	   sign-in prompt). Never fall back to the demo account's tickets. */
	if (!locals.session) return { tickets: [], session: null };
	const tickets = await getSource(createSupabase(cookies)).getTickets(locals.session.userId).catch(() => []);
	return { tickets, session: locals.session };
};

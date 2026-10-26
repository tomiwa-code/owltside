import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	/* Unregistered visitors are asked to sign in (the page renders the
	   sign-in prompt). Never fall back to the demo account's tickets. */
	if (!locals.session) return { tickets: [], approvals: [], session: null };
	const source = getSource(createSupabase(cookies));
	const [tickets, approvals] = await Promise.all([
		// Refund requests are decided by an admin, so the vault shows them as pending.
		source.getTickets(locals.session.userId).catch(() => []),
		source.listApprovals(locals.session.userId).catch(() => [])
	]);
	return { tickets, approvals, session: locals.session };
};

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auditFor, getUser, ordersForEmail, ticketsForHandle } from '$admin/server/store';
import { adminDataSource, getSupabaseUser, liveFailure } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ params }) => {
	const source = adminDataSource();
	if (source === 'supabase') {
		let live: Awaited<ReturnType<typeof getSupabaseUser>>;
		try {
			live = await getSupabaseUser(params.id);
		} catch (cause) {
			liveFailure('user record', cause);
		}
		if (!live) error(404, 'User not found.');
		return { ...live, audit: [], source };
	}
	const user = getUser(params.id);
	if (!user) error(404, 'User not found.');
	return {
		user,
		tickets: ticketsForHandle(user.handle, 8),
		orders: ordersForEmail(user.email, 8),
		audit: auditFor(user.id, 6),
		source
	};
};

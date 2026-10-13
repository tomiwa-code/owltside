import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const [events, notifications, tickets] = await Promise.all([
		source.listEvents(),
		source.getNotifications(userId).catch(() => []),
		source.getTickets(userId).catch(() => [])
	]);
	return { events, unread: notifications.filter((n) => !n.read).length, tickets };
};

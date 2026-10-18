import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const items = await getSource(createSupabase(cookies)).getNotifications(locals.session?.userId ?? 'demo').catch(() => []);
	return { items };
};

export const actions: Actions = {
	markAll: async ({ locals, cookies }) => {
		await getSource(createSupabase(cookies)).markAllNotificationsRead(locals.session?.userId ?? 'demo');
		return { ok: true };
	}
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { Actions } from './$types';

export const actions: Actions = {
	markAll: async ({ locals, cookies }) => {
		await getSource(createSupabase(cookies)).markAllNotificationsRead(locals.session?.userId ?? 'demo');
		return { ok: true };
	}
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const conversations = await getSource(createSupabase(cookies)).getConversations(locals.session?.userId ?? 'demo');
	return { conversations };
};

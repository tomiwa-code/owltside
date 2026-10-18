import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const [conversations, messageRequests] = await Promise.all([
		source.getConversations(userId).catch(() => []),
		locals.session ? source.getIncomingMessageRequests(userId).catch(() => []) : Promise.resolve([])
	]);
	return { conversations, messageRequests };
};

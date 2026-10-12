import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const conversations = await source.getConversations(locals.session?.userId ?? 'demo');
	const conversation = conversations.find((c) => c.id === params.id);
	if (!conversation) error(404, 'Conversation not found');
	const messages = await source.getMessages(params.id);
	return { conversation, messages };
};

export const actions: Actions = {
	send: async ({ request, params, locals, cookies }) => {
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return error(400, 'Empty message');
		const senderId = locals.session?.userId ?? 'u-ada';
		await getSource(createSupabase(cookies)).sendMessage(params.id, senderId, body);
		return { ok: true };
	},
	read: async ({ params, cookies }) => {
		await getSource(createSupabase(cookies)).markConversationRead(params.id);
		return { ok: true };
	}
};

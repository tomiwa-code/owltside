import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { sendWebPushToUser } from '$lib/server/webpush';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const conversations = await source.getConversations(userId);
	const conversation = conversations.find((c) => c.id === params.id);
	if (!conversation) error(404, 'Conversation not found');
	const messages = await source.getMessages(params.id);
	return { conversation, messages, conversations };
};

export const actions: Actions = {
	send: async ({ request, params, locals, cookies }) => {
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return error(400, 'Empty message');
		const senderId = locals.session?.userId ?? 'u-ada';
		const source = getSource(createSupabase(cookies));
		const sent = await source.sendMessage(params.id, senderId, body);

		// Best-effort background W3C Web Push to the recipient's subscribed devices
		try {
			const conversations = await source.getConversations(senderId);
			const conv = conversations.find((c) => c.id === params.id);
			const recipientId = conv?.peer?.id;
			if (recipientId && recipientId !== senderId) {
				const senderName = locals.session?.name || 'Owltside User';
				const parsedMs = Date.parse(sent.sentAt);
				const tagSuffix = Number.isFinite(parsedMs) ? String(parsedMs) : sent.id;
				await Promise.race([
					sendWebPushToUser(recipientId, {
						title: `New message from ${senderName}`,
						body,
						url: `/inbox/${params.id}`,
						tag: `owltside-dm-${params.id}-${tagSuffix}`
					}),
					new Promise((resolve) => setTimeout(resolve, 1_500))
				]);
			}
		} catch {
			// Never block message delivery if push relay is unavailable
		}

		return { ok: true };
	}
};

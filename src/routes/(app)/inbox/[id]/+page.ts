import type { Conversation, Message } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * One thread plus the desktop inbox column, both cache-first.
 *
 * The conversation is resolved by id (the list is paged, so an older thread may
 * not be on page one) and the list itself comes from the same key the inbox tab
 * uses, so switching between tabs and threads costs no request while warm.
 */
export const load: PageLoad = async ({ fetch, params }) => {
	const id = params.id;

	const [conversation, messages, conversations] = await Promise.all([
		cachedJson<Conversation>(fetch, {
			key: queryKeys.conversation(id),
			url: `/api/conversations/${encodeURIComponent(id)}`,
			staleTime: STALE_TIME.inbox
		}).catch(() => undefined),
		cachedJson<Message[]>(fetch, {
			key: queryKeys.messages(id),
			url: `/api/conversations/${encodeURIComponent(id)}/messages`,
			staleTime: STALE_TIME.inbox
		}).catch(() => [] as Message[]),
		cachedJson<Conversation[]>(fetch, {
			key: queryKeys.conversations,
			url: '/api/conversations',
			staleTime: STALE_TIME.inbox
		}).catch(() => [] as Conversation[])
	]);

	if (!conversation) error(404, 'Conversation not found');
	return { conversation, messages, conversations };
};

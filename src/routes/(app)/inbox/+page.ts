import type { Conversation, MessageRequest } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/** Cache-first inbox lists; the WebSocket bridge keeps them current. */
export const load: PageLoad = async ({ fetch }) => {
	const [conversations, messageRequests] = await Promise.all([
		cachedJson<Conversation[]>(fetch, {
			key: queryKeys.conversations,
			url: '/api/conversations',
			staleTime: STALE_TIME.inbox
		}).catch(() => [] as Conversation[]),
		cachedJson<MessageRequest[]>(fetch, {
			key: queryKeys.messageRequests,
			url: '/api/message-requests',
			staleTime: STALE_TIME.inbox
		}).catch(() => [] as MessageRequest[])
	]);
	return { conversations, messageRequests };
};

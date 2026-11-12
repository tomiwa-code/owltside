import type { NotificationItem } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/** Cache-first notification stream; new rows arrive over Realtime. */
export const load: PageLoad = async ({ fetch }) => {
	const items = await cachedJson<NotificationItem[]>(fetch, {
		key: queryKeys.notifications,
		url: '/api/notifications',
		staleTime: STALE_TIME.live
	}).catch(() => [] as NotificationItem[]);
	return { items };
};

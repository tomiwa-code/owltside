import type { EventItem, Profile } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * A public profile and the events it hosts or speaks at, cache-first. Visiting
 * the same person twice — or bouncing between their events and profile — does
 * not hit the server while the entry is fresh.
 */
export const load: PageLoad = async ({ fetch, params }) => {
	const handle = params.handle;
	const payload = await cachedJson<{ profile: Profile; events: EventItem[] }>(fetch, {
		key: queryKeys.user(handle),
		url: `/api/users/${encodeURIComponent(handle)}`,
		staleTime: STALE_TIME.account
	}).catch(() => undefined);

	if (!payload?.profile) error(404, 'No such person');
	return { profile: payload.profile, events: payload.events ?? [] };
};

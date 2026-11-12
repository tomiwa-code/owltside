import type { ProfileSnapshot } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import type { PageLoad } from './$types';

/**
 * One snapshot (profile, tickets, organized/speaking events) for the profile
 * tab, read from the cache while it is fresh. Mutations invalidate the key.
 */
export const load: PageLoad = async ({ fetch, parent }) => {
	try {
		return await cachedJson<ProfileSnapshot>(fetch, {
			key: queryKeys.profile,
			url: '/api/profile',
			staleTime: STALE_TIME.account
		});
	} catch {
		const { session, demoMode } = await parent();
		return {
			session: session ?? null,
			demoMode: Boolean(demoMode),
			tickets: [],
			profile: null,
			events: []
		} satisfies ProfileSnapshot;
	}
};

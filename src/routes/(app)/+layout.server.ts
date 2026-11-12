import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { detectHeaderLocation } from '$lib/utils/organizers';
import type { LayoutServerLoad } from './$types';

/**
 * Every navigation runs this load, so it stays deliberately cheap.
 *
 * It used to read the whole notification stream, every conversation (with both
 * participants' profiles) and the pending message requests just to add up two
 * badge numbers. `getBadgeCounts()` does the counting in Postgres — two
 * COUNT-only queries and a two-integer scan — and returns bytes, not rows.
 */
export const load: LayoutServerLoad = async ({ cookies, request, locals }) => {
	const operatingIdentity = locals.session?.role ?? 'guest';
	// Read the visitor's approximate city from the edge headers. Deliberately
	// no `url` here: a load that tracks the URL is invalidated on *every*
	// navigation, which used to re-read the profile, follow graph and badge
	// counters on each tab switch. Route-specific gates live in nested layouts.
	const detectedLocation = detectHeaderLocation(request?.headers);

	const source = getSource(createSupabase(cookies));
	// These reads are independent; awaiting them one after another used to put
	// three serial round trips on every navigation. They seed the client's
	// TanStack Query cache (see AppHeader), which owns freshness from then on.
	const [profile, following, counters] = await Promise.all([
		locals.session
			? source.getProfile(locals.session.handle).catch(() => null)
			: Promise.resolve(null),
		locals.session
			? source.getFollowingIds(locals.session.userId).then(
					(ids) => ({ ids, error: false }),
					() => ({ ids: [] as string[], error: true })
				)
			: Promise.resolve({ ids: [] as string[], error: false }),
		locals.session
			? source.getBadgeCounts(locals.session.userId).catch(() => null)
			: Promise.resolve(null)
	]);
	return {
		operatingIdentity,
		currentProfile: profile ?? null,
		followingIds: following.ids,
		unread: counters?.unread ?? 0,
		inboxUnread: counters?.inboxUnread ?? 0,
		followLoadError: following.error,
		...(detectedLocation ? { detectedLocation } : {})
	};
};

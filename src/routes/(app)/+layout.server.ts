import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';

/**
 * Every navigation runs this load, so it stays deliberately cheap.
 *
 * It used to read the whole notification stream, every conversation (with both
 * participants' profiles) and the pending message requests just to add up two
 * badge numbers. `getBadgeCounts()` does the counting in Postgres — two
 * COUNT-only queries and a two-integer scan — and returns bytes, not rows.
 */
export const load: LayoutServerLoad = async ({ cookies, url, locals }) => {
	const operatingIdentity = locals.session?.role ?? 'guest';

	if (url.pathname === '/organizer' || url.pathname.startsWith('/organizer/')) {
		if (!hasOrganizerIdentity(locals.session)) redirect(303, '/settings?identity=organizer-required');
	}

	const source = getSource(createSupabase(cookies));
	const currentProfile = locals.session ? (await source.getProfile(locals.session.handle).catch(() => null)) ?? null : null;
	let followingIds: string[] = [];
	let unread = 0;
	let inboxUnread = 0;
	let followLoadError = false;
	if (locals.session) {
		try {
			followingIds = await source.getFollowingIds(locals.session.userId);
		} catch {
			followLoadError = true;
		}
		try {
			const badges = await source.getBadgeCounts(locals.session.userId);
			unread = badges.unread;
			inboxUnread = badges.inboxUnread;
		} catch {
			// Keep the defaults on partial failure; the client refresh below retries.
		}
	}
	return { operatingIdentity, currentProfile, followingIds, unread, inboxUnread, followLoadError };
};

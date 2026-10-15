import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { OPERATING_IDENTITY_COOKIE, isOperatingIdentity } from '$lib/constants/operating-identity';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';

export const load: LayoutServerLoad = async ({ cookies, url, locals }) => {
	const savedIdentity = cookies.get(OPERATING_IDENTITY_COOKIE) ?? '';
	const operatingIdentity = isOperatingIdentity(savedIdentity) ? savedIdentity : 'attendee';

	if (url.pathname === '/organizer' || url.pathname.startsWith('/organizer/')) {
		if (!hasOrganizerIdentity(cookies)) redirect(303, '/settings?identity=organizer-required');
	}

	const source = getSource(createSupabase(cookies));
	const currentProfile = locals.session ? await source.getProfile(locals.session.handle) ?? null : null;
	let followingIds: string[] = [];
	let unread = 0;
	let followLoadError = false;
	if (locals.session) {
		try { followingIds = await source.getFollowingIds(locals.session.userId); }
		catch { followLoadError = true; }
		unread = (await source.getNotifications(locals.session.userId).catch(() => [])).filter((n) => !n.read).length;
	}
	return { operatingIdentity, currentProfile, followingIds, unread, followLoadError };
};

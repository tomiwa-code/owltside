import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';

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
			const [notifications, conversations, requests] = await Promise.all([
				source.getNotifications(locals.session.userId).catch(() => []),
				source.getConversations(locals.session.userId).catch(() => []),
				source.getIncomingMessageRequests(locals.session.userId).catch(() => [])
			]);
			unread = notifications.filter((n) => !n.read).length;
			const convoUnread = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0);
			inboxUnread = convoUnread + requests.length;
		} catch {
			// keep defaults on partial failure
		}
	}
	return { operatingIdentity, currentProfile, followingIds, unread, inboxUnread, followLoadError };
};

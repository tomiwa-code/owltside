import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { EventItem, ProfileSnapshot } from '$lib/types';
import type { RequestHandler } from './$types';

/** Feed + events the member organizes or speaks at, de-duplicated by id. */
function mergeEvents(feed: EventItem[], own: EventItem[]): EventItem[] {
	const events = new Map(feed.map((event) => [event.id, event]));
	for (const event of own) events.set(event.id, event);
	return [...events.values()];
}

/**
 * The profile tab's snapshot. Extracted from the former `+page.server.ts` load
 * so the route can read it from the query cache on navigation instead of
 * re-querying tickets and events every time the tab is opened.
 */
export const GET: RequestHandler = async ({ locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const headers = { 'cache-control': 'private, no-store' };

	if (!locals.session) {
		const [feedEvents, demoProfileEvents] = await Promise.all([
			source.listEvents().catch(() => []),
			locals.demoMode ? source.getProfileEvents('u-ada').catch(() => []) : Promise.resolve([])
		]);
		const body: ProfileSnapshot = {
			session: null,
			demoMode: locals.demoMode,
			tickets: [],
			profile: null,
			events: mergeEvents(feedEvents, demoProfileEvents)
		};
		return json(body, { headers });
	}

	const [tickets, profile, feedEvents, ownProfileEvents] = await Promise.all([
		source.getTickets(locals.session.userId).catch(() => []),
		source.getProfile(locals.session.handle).catch(() => undefined),
		source.listEvents().catch(() => []),
		source.getProfileEvents(locals.session.userId).catch(() => [])
	]);
	const body: ProfileSnapshot = {
		session: locals.session,
		demoMode: locals.demoMode,
		tickets,
		profile: profile ?? null,
		events: mergeEvents(feedEvents, ownProfileEvents)
	};
	return json(body, { headers });
};

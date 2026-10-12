import { createSupabase, supabaseConfigured } from '$lib/server/supabase';
import { demo } from '$lib/server/demo-index';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const db = createSupabase(event.cookies);
	event.locals.demoMode = !supabaseConfigured();
	event.locals.session = null;

	if (db) {
		const {
			data: { user }
		} = await db.auth.getUser();
		if (user) {
			const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
			event.locals.session = {
				userId: user.id,
				email: user.email ?? '',
				handle: profile?.handle ?? 'you',
				name: profile?.name ?? (user.email?.split('@')[0] || 'Explorer'),
				role: 'attendee',
				avatarUrl: profile?.avatar_url ?? null
			};
		}
	} else if (event.cookies.get('owltside_demo_session')) {
		const me = demo.me;
		event.locals.session = {
			userId: me.id,
			email: 'ada@owltside.app',
			handle: me.handle,
			name: me.name,
			role: 'attendee',
			avatarUrl: null,
			demo: true
		};
	}

	return resolve(event);
};

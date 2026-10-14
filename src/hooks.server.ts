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
				avatarUrl: profile?.avatar_url ?? null,
				usernameChangedAt: profile?.username_changed_at ?? null
			};
		}
	} else if (event.cookies.get('owltside_demo_session')) {
		const me = demo.me;
		let demoProfile: { name?: string; username?: string; usernameChangedAt?: string | null } = {};
		try {
			demoProfile = JSON.parse(event.cookies.get('owltside_demo_profile') ?? '{}');
		} catch {
			/* ignore a malformed local demo profile */
		}
		event.locals.session = {
			userId: me.id,
			email: 'ada@owltside.app',
			handle: demoProfile.username ?? me.handle,
			name: demoProfile.name ?? me.name,
			role: 'attendee',
			avatarUrl: null,
			usernameChangedAt: demoProfile.usernameChangedAt ?? null,
			demo: true
		};
	}

	return resolve(event);
};

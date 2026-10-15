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
			let { data: profile } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
			if (!profile) {
				const rawHandle =
					(user.user_metadata?.handle as string | undefined) ||
					user.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').toLowerCase() ||
					`owl_${user.id.slice(0, 6)}`;
				const rawName =
					(user.user_metadata?.full_name as string | undefined) ||
					user.email?.split('@')[0] ||
					'Explorer';
				const { data: created } = await db
					.from('profiles')
					.upsert({ id: user.id, handle: rawHandle, name: rawName }, { onConflict: 'id' })
					.select('*')
					.maybeSingle();
				profile = created;
			}
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

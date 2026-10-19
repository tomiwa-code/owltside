import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { OPERATING_IDENTITY_COOKIE, isOperatingIdentity } from '$lib/constants/operating-identity';
import { createSupabase } from '$lib/server/supabase';

export const actions: Actions = {
	setIdentity: async ({ request, cookies, locals }) => {
		if (!locals.session) return fail(401, { error: 'Sign in to switch roles.' });
		const form = await request.formData();
		const identity = String(form.get('identity') ?? '');
		if (!isOperatingIdentity(identity)) return fail(400, { error: 'Choose a valid operating identity.' });

		if (!locals.session.demo) {
			const db = createSupabase(cookies);
			if (!db) return fail(503, { error: 'Role switching is temporarily unavailable. Please try again.' });
			try {
				// A user-editable UI preference, not an admin or ownership permission.
				const { error } = await db.auth.updateUser({ data: { operating_identity: identity } });
				if (error) return fail(503, { error: 'Your role could not be saved. Please try again.' });
			} catch { return fail(503, { error: 'Your role could not be saved. Please try again.' }); }
			// Mirror the choice onto the public profile so other people see it
			// (e.g. under the name in conversation lists). Best-effort: auth
			// metadata stays the source of truth for the user's own session, and
			// an un-migrated database (017 not yet applied) must not block the
			// switch — the request hook re-syncs the mirror whenever it drifts.
			try {
				await db.from('profiles').update({ operating_identity: identity }).eq('id', locals.session.userId);
			} catch { /* mirror re-syncs on the next request */ }
		}

		cookies.set(OPERATING_IDENTITY_COOKIE, identity, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: true,
			sameSite: 'lax'
		});

		const returnTo = String(form.get('returnTo') ?? '');
		// Only local, known destinations are accepted.
		redirect(303, returnTo === '/profile' ? '/profile' : returnTo === '/settings' ? '/settings' : identity === 'organizer' ? '/organizer' : '/settings');
	},
	signout: async ({ cookies }) => {
		const db = createSupabase(cookies);
		if (db) {
			await db.auth.signOut();
		}
		cookies.delete('owltside_demo_session', { path: '/' });
		cookies.delete(OPERATING_IDENTITY_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};

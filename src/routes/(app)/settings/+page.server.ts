import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { OPERATING_IDENTITY_COOKIE, isOperatingIdentity } from '$lib/constants/operating-identity';
import { createSupabase } from '$lib/server/supabase';
import { getSource } from '$lib/server/datasource';
import {
	BIOMETRIC_JUST_AUTHED_COOKIE,
	BIOMETRIC_UNLOCKED_COOKIE,
	BIOMETRIC_VAULT_COOKIE
} from '$lib/server/webauthn';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// Verification and payout checks wait for an admin decision, so the page needs
	// the viewer's own requests to show pending / rejected states honestly.
	const approvals = await getSource(createSupabase(cookies))
		.listApprovals(locals.session?.userId ?? 'demo')
		.catch(() => []);
	return { approvals };
};

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
	deleteAccount: async ({ request, cookies, locals }) => {
		if (!locals.session) return fail(401, { error: 'Sign in to delete your account.' });
		const form = await request.formData();
		const confirmation = String(form.get('confirmation') ?? '').trim();
		const expected = (locals.session.email ?? '').trim().toLowerCase();
		const accepted = [expected, 'delete'].filter(Boolean);
		if (!accepted.includes(confirmation.toLowerCase())) {
			return fail(400, { error: 'Type your account email (or DELETE) to confirm.' });
		}

		const db = createSupabase(cookies);
		if (!locals.session.demo && db) {
			// `delete_own_account()` is a SECURITY DEFINER function (migration 024):
			// it removes the caller's profile and auth user without ever exposing a
			// service-role key to the app. Falls back to anonymising the profile when
			// the function has not been installed yet.
			const { error: rpcError } = await db.rpc('delete_own_account');
			if (rpcError) {
				const anonymised = `deleted-${locals.session.userId.slice(0, 8)}@owltside.invalid`;
				const { error: profileError } = await db
					.from('profiles')
					.update({ handle: `deleted_${locals.session.userId.slice(0, 8)}`, display_name: 'Deleted account', email: anonymised, bio: '' })
					.eq('id', locals.session.userId);
				if (profileError) {
					return fail(503, { error: 'Your account could not be deleted. Please try again or contact support.' });
				}
			}
			await db.auth.signOut().catch(() => undefined);
		}

		cookies.delete('owltside_demo_session', { path: '/' });
		cookies.delete(OPERATING_IDENTITY_COOKIE, { path: '/' });
		cookies.delete(BIOMETRIC_VAULT_COOKIE, { path: '/' });
		cookies.delete(BIOMETRIC_UNLOCKED_COOKIE, { path: '/' });
		cookies.delete(BIOMETRIC_JUST_AUTHED_COOKIE, { path: '/' });
		redirect(303, '/');
	},
	signout: async ({ cookies }) => {
		const db = createSupabase(cookies);
		if (db) {
			await db.auth.signOut();
		}
		cookies.delete('owltside_demo_session', { path: '/' });
		cookies.delete(OPERATING_IDENTITY_COOKIE, { path: '/' });
		cookies.delete(BIOMETRIC_UNLOCKED_COOKIE, { path: '/' });
		cookies.delete(BIOMETRIC_JUST_AUTHED_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};

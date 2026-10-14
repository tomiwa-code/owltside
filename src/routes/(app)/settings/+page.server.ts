import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { OPERATING_IDENTITY_COOKIE, isOperatingIdentity } from '$lib/constants/operating-identity';

export const actions: Actions = {
	setIdentity: async ({ request, cookies }) => {
		const form = await request.formData();
		const identity = String(form.get('identity') ?? '');
		if (!isOperatingIdentity(identity)) return fail(400, { error: 'Choose a valid operating identity.' });

		cookies.set(OPERATING_IDENTITY_COOKIE, identity, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: true,
			sameSite: 'lax'
		});

		redirect(303, identity === 'organizer' ? '/organizer' : '/settings');
	},
	signout: async ({ cookies }) => {
		cookies.delete('owltside_demo_session', { path: '/' });
		cookies.delete(OPERATING_IDENTITY_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};

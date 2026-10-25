import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The console has no landing page of its own — `/` is the natural entry point
 * for a preview URL, a bookmark or a hand-typed address, so send the visitor to
 * the dashboard (signed in) or the sign-in screen (signed out) instead of
 * rendering a 404.
 */
export const load: PageServerLoad = ({ locals }) => {
	redirect(303, locals.admin ? '/dashboard' : '/login');
};

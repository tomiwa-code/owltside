import { redirect } from '@sveltejs/kit';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';
import type { LayoutServerLoad } from './$types';

/**
 * Only organizer routes pay for this check. It used to live in the shared
 * `(app)` layout, where reading `url` made that layout's data re-run on every
 * navigation — including plain attendee tab switches.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	if (!hasOrganizerIdentity(locals.session)) redirect(303, '/settings?identity=organizer-required');
};

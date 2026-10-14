import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { OPERATING_IDENTITY_COOKIE, isOperatingIdentity } from '$lib/constants/operating-identity';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';

export const load: LayoutServerLoad = ({ cookies, url }) => {
	const savedIdentity = cookies.get(OPERATING_IDENTITY_COOKIE) ?? '';
	const operatingIdentity = isOperatingIdentity(savedIdentity) ? savedIdentity : 'attendee';

	if (url.pathname === '/organizer' || url.pathname.startsWith('/organizer/')) {
		if (!hasOrganizerIdentity(cookies)) redirect(303, '/settings?identity=organizer-required');
	}

	return { operatingIdentity };
};

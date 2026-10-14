import { OPERATING_IDENTITY_COOKIE } from '$lib/constants/operating-identity';

export function hasOrganizerIdentity(cookies: { get(name: string): string | undefined }): boolean {
	return cookies.get(OPERATING_IDENTITY_COOKIE) === 'organizer';
}

import type { Session } from '$lib/types';

/** Operating mode only; database ownership/RLS still controls event access. */
export function hasOrganizerIdentity(session: Session | null): boolean {
	return session?.role === 'organizer';
}

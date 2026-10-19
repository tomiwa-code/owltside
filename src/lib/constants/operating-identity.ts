export const OPERATING_IDENTITY_COOKIE = 'owltside_operating_identity';

export const OPERATING_IDENTITIES = ['attendee', 'guest', 'organizer'] as const;
export type OperatingIdentity = (typeof OPERATING_IDENTITIES)[number];

export function isOperatingIdentity(value: string): value is OperatingIdentity {
	return (OPERATING_IDENTITIES as readonly string[]).includes(value);
}

export const OPERATING_IDENTITY_LABELS: Record<OperatingIdentity, string> = {
	attendee: 'Attendee',
	guest: 'Guest',
	organizer: 'Organizer'
};

/**
 * Display label for a user's chosen operating identity. Unknown / unset
 * identities fall back to 'Attendee' — the same default the session uses
 * when a user has never picked one (see hooks.server.ts).
 */
export function operatingIdentityLabel(identity?: string | null): string {
	return OPERATING_IDENTITY_LABELS[identity && isOperatingIdentity(identity) ? identity : 'attendee'];
}

/**
 * Label shown under a conversation peer's name: the operating identity that
 * user chose for themselves. The Owltside system account is not a person and
 * has no operating identity, so it keeps its 'Event channel' label.
 */
export function peerIdentityLabel(peer: {
	handle: string;
	operatingIdentity?: OperatingIdentity | null;
}): string {
	if (peer.handle === 'owltside') return 'Event channel';
	return operatingIdentityLabel(peer.operatingIdentity);
}

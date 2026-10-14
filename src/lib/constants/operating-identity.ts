export const OPERATING_IDENTITY_COOKIE = 'owltside_operating_identity';

export const OPERATING_IDENTITIES = ['attendee', 'guest', 'organizer'] as const;
export type OperatingIdentity = (typeof OPERATING_IDENTITIES)[number];

export function isOperatingIdentity(value: string): value is OperatingIdentity {
	return (OPERATING_IDENTITIES as readonly string[]).includes(value);
}

/**
 * Mirrors identity-provider details onto `public.profiles`.
 *
 * Google reports `full_name` / `name` and `avatar_url` / `picture` in the
 * user's `user_metadata`. The provider only ever *fills gaps*: a name or photo
 * the profile already has is never replaced by what the provider reports.
 */

type ProviderMeta = Record<string, unknown> | null | undefined;
type ProfileFields = { name?: string | null; avatar_url?: string | null };

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** The display name and photo URL the identity provider reported, if any. */
export function providerProfile(meta: ProviderMeta): { name?: string; avatarUrl?: string } {
	return {
		name: text(meta?.full_name) ?? text(meta?.name),
		avatarUrl: text(meta?.avatar_url) ?? text(meta?.picture)
	};
}

/**
 * The columns of an existing profile that are still empty (null or blank) and
 * can be filled from provider metadata. Columns that already hold a value are
 * left out, so applying the result never overwrites anything.
 */
export function fillEmptyProfileFields(
	profile: ProfileFields,
	meta: ProviderMeta
): { name?: string; avatar_url?: string } {
	const provider = providerProfile(meta);
	const updates: { name?: string; avatar_url?: string } = {};
	if (provider.name && !text(profile.name)) updates.name = provider.name;
	if (provider.avatarUrl && !text(profile.avatar_url)) updates.avatar_url = provider.avatarUrl;
	return updates;
}

import { persisted } from './persist.svelte';

export interface ProfileDraft {
	hasChanges: boolean;
	name: string;
	username: string;
	bio: string;
	city: string;
	link: string;
	interests: string[];
	usernameChangedAt: string | null;
}

export interface ProfileAppearance {
	/** Already resized + cropped by the upload crop step. */
	avatarData: string | null;
	bannerData: string | null;
}

export const profileDraft = persisted<ProfileDraft>('owltside.profile.draft.v1', {
	hasChanges: false,
	name: '',
	username: '',
	bio: '',
	city: '',
	link: '',
	interests: [],
	usernameChangedAt: null
});

export const profileAppearance = persisted<ProfileAppearance>('owltside.profile.appearance.v1', {
	avatarData: null,
	bannerData: null
});

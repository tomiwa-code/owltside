import { describe, expect, it } from 'vitest';
import { fillEmptyProfileFields, providerProfile } from './profile-sync';

const google = {
	full_name: 'Ada Obi (Google)',
	avatar_url: 'https://lh3.googleusercontent.com/a/ada.png'
};

describe('providerProfile', () => {
	it('reads Google full_name and avatar_url', () => {
		expect(providerProfile(google)).toEqual({
			name: 'Ada Obi (Google)',
			avatarUrl: 'https://lh3.googleusercontent.com/a/ada.png'
		});
	});

	it('falls back to name and picture', () => {
		expect(providerProfile({ name: 'Ada', picture: 'https://example.com/p.png' })).toEqual({
			name: 'Ada',
			avatarUrl: 'https://example.com/p.png'
		});
	});

	it('prefers full_name over name and avatar_url over picture', () => {
		expect(
			providerProfile({ full_name: 'Full', name: 'Short', avatar_url: 'https://a', picture: 'https://b' })
		).toEqual({ name: 'Full', avatarUrl: 'https://a' });
	});

	it('ignores blank and non-string values', () => {
		expect(providerProfile({ full_name: '   ', name: 42, avatar_url: '', picture: null })).toEqual({
			name: undefined,
			avatarUrl: undefined
		});
	});

	it('copes with missing metadata', () => {
		expect(providerProfile(undefined)).toEqual({ name: undefined, avatarUrl: undefined });
		expect(providerProfile(null)).toEqual({ name: undefined, avatarUrl: undefined });
	});
});

describe('fillEmptyProfileFields', () => {
	it('never replaces a name or photo the profile already has', () => {
		const profile = { name: 'Ada Obi', avatar_url: 'https://cdn.owltside.app/ada.png' };
		expect(fillEmptyProfileFields(profile, google)).toEqual({});
	});

	it('fills a missing photo but keeps the existing name', () => {
		expect(fillEmptyProfileFields({ name: 'Ada Obi', avatar_url: null }, google)).toEqual({
			avatar_url: 'https://lh3.googleusercontent.com/a/ada.png'
		});
	});

	it('fills a blank name but keeps the existing photo', () => {
		expect(
			fillEmptyProfileFields({ name: '  ', avatar_url: 'https://cdn.owltside.app/ada.png' }, google)
		).toEqual({ name: 'Ada Obi (Google)' });
	});

	it('fills both when the profile has neither', () => {
		expect(fillEmptyProfileFields({ name: '', avatar_url: undefined }, google)).toEqual({
			name: 'Ada Obi (Google)',
			avatar_url: 'https://lh3.googleusercontent.com/a/ada.png'
		});
	});

	it('does nothing when the provider reports no details', () => {
		expect(fillEmptyProfileFields({ name: '', avatar_url: null }, {})).toEqual({});
		expect(fillEmptyProfileFields({ name: '', avatar_url: null }, undefined)).toEqual({});
	});
});

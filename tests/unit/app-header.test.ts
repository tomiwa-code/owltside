import AppHeader from '$components/AppHeader.svelte';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from '$app/state';
import { profileAppearance } from '$lib/state/profile.svelte';

beforeEach(() => {
	Object.assign(page.data, { session: { userId: 'me', name: 'Ada', avatarUrl: 'https://example.com/saved.jpg' }, currentProfile: null, unread: 2, operatingIdentity: 'attendee' });
	profileAppearance.value = { avatarData: null, bannerData: null };
});
afterEach(() => { cleanup(); profileAppearance.value = { avatarData: null, bannerData: null }; });
describe('shared feed header', () => {
	it('shows the saved photo, including on notifications', () => {
		page.url = new URL('http://localhost/notifications') as typeof page.url;
		render(AppHeader);
		expect(screen.getByRole('link', { name: 'Your profile' }).querySelector('img')?.getAttribute('src')).toBe('https://example.com/saved.jpg');
		expect(document.querySelectorAll('header')).toHaveLength(1);
	});
	it('immediately reflects a cropped photo for this account', async () => {
		render(AppHeader);
		profileAppearance.value = { ownerId: 'me', avatarData: 'data:image/jpeg;base64,NEW', bannerData: null };
		await tick();
		expect(screen.getByRole('link', { name: 'Your profile' }).querySelector('img')?.getAttribute('src')).toContain('NEW');
	});
	it('never shows a previous account’s local photo', () => {
		profileAppearance.value = { ownerId: 'someone-else', avatarData: 'data:image/jpeg;base64,OTHER', bannerData: null };
		render(AppHeader);
		expect(screen.getByRole('link', { name: 'Your profile' }).querySelector('img')?.getAttribute('src')).not.toContain('OTHER');
	});
});

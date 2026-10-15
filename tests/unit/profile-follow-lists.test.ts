import ProfilePage from '../../src/routes/(app)/profile/+page.svelte';
import CommunityProfilePage from '../../src/routes/(app)/users/[handle]/+page.svelte';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { follows } from '$lib/state/prefs.svelte';
import type { Profile } from '$lib/types';

const layoutData = { session: null, demoMode: true, operatingIdentity: 'attendee' as const };

const communityProfile: Profile = {
	id: 'p1',
	handle: 'drbello',
	name: 'Dr. Amina Bello',
	avatarColor: '#009eb9',
	followers: 1240,
	following: 310,
	verified: true,
	city: 'Abuja',
	bio: 'Public-health technologist',
	link: null
};

const communityData = { ...layoutData, profile: communityProfile, events: [] };
const ownProfileData = {
	...layoutData,
	session: {
		userId: 'u-ada',
		email: 'ada@owltside.app',
		handle: 'adaobi',
		name: 'Ada Obi',
		role: 'attendee' as const,
		avatarUrl: null
	},
	profile: null,
	tickets: [],
	events: []
};
const guestProfileData = { ...layoutData, session: null, profile: null, tickets: [], events: [] };

const rowButtons = () =>
	Array.from(document.querySelectorAll('a[href^="/users/"]')).map(
		(row) => (row.querySelector('button')?.textContent ?? '').trim()
	);

const openSheet = async (label: 'Followers' | 'Following') => {
	const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
		new RegExp(`${label}$`).test((candidate.textContent ?? '').replace(/\s+/g, ''))
	);
	if (!button) throw new Error(`No ${label} button on the page`);
	await fireEvent.click(button);
	await tick();
};

describe('follow lists', () => {
	afterEach(() => {
		cleanup();
		follows.value = [];
	});

	it('community profile: followers rows show Follow buttons, not follower counts', async () => {
		render(CommunityProfilePage, { props: { data: communityData } });
		await openSheet('Followers');

		const labels = rowButtons();
		expect(labels.length).toBeGreaterThan(0);
		expect(labels.every((label) => label === 'Follow' || label === 'Following')).toBe(true);
		for (const row of document.querySelectorAll('a[href^="/users/"]')) {
			expect(row.textContent ?? '').not.toMatch(/\d[\d,]*\s*followers/i);
		}
	});

	it('community profile: following a row from the followers list persists', async () => {
		render(CommunityProfilePage, { props: { data: communityData } });
		await openSheet('Followers');

		const firstRow = document.querySelector('a[href^="/users/"]') as HTMLAnchorElement;
		const href = firstRow.getAttribute('href');
		await fireEvent.click(firstRow.querySelector('button') as HTMLButtonElement);
		await tick();
		expect(follows.value).toHaveLength(1);

		await openSheet('Followers');
		const refreshed = document.querySelector(`a[href="${href}"] button`) as HTMLButtonElement | null;
		expect(refreshed?.textContent?.trim()).toBe('Following');

		await fireEvent.click(refreshed!);
		await tick();
		expect(follows.value).toHaveLength(0);
	});

	it('own profile: followers rows show Follow buttons, not follower counts', async () => {
		render(ProfilePage, { props: { data: ownProfileData } });
		await openSheet('Followers');

		const labels = rowButtons();
		expect(labels.length).toBeGreaterThan(0);
		expect(labels.every((label) => label === 'Follow' || label === 'Following')).toBe(true);
		for (const row of document.querySelectorAll('a[href^="/users/"]')) {
			expect(row.textContent ?? '').not.toMatch(/\d[\d,]*\s*followers/i);
		}
	});

	it('own profile: following list keeps its Follow buttons', async () => {
		render(ProfilePage, { props: { data: ownProfileData } });
		await openSheet('Following');

		const labels = rowButtons();
		expect(labels.length).toBeGreaterThan(0);
		expect(labels.every((label) => label === 'Follow' || label === 'Following')).toBe(true);
	});

	it('guest profile: prompts the guest to sign in and does not show dummy followers', () => {
		const { container } = render(ProfilePage, { props: { data: guestProfileData } });
		expect(container.textContent).toContain('Sign in to view your profile');
		expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
		expect(container.querySelector('a[href="/auth/signup"]')).not.toBeNull();
		expect(container.textContent).not.toContain('342');
	});
});

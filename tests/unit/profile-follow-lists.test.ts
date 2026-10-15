import ProfilePage from '../../src/routes/(app)/profile/+page.svelte';
import CommunityProfilePage from '../../src/routes/(app)/users/[handle]/+page.svelte';
import ConnectionsSheet from '$components/ConnectionsSheet.svelte';
import FollowButton from '$components/FollowButton.svelte';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import type { Profile } from '$lib/types';

const layoutData = { session: null, demoMode: true, operatingIdentity: 'attendee' as const, unread: 0, currentProfile: null, followingIds: [], followLoadError: false };
const communityProfile: Profile = {
	id: 'p1', handle: 'drbello', name: 'Dr. Amina Bello', avatarColor: '#009eb9',
	followers: 0, following: 0, verified: true, city: 'Abuja', bio: 'Public-health technologist', link: null
};
const session = { userId: 'u-ada', email: 'ada@owltside.app', handle: 'adaobi', name: 'Ada Obi', role: 'attendee' as const, avatarUrl: null };
const ownProfileData = { ...layoutData, session, profile: null, tickets: [], events: [] };
const openSheet = async (label: 'Followers' | 'Following') => {
	const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
		new RegExp(`${label}$`).test((candidate.textContent ?? '').replace(/\s+/g, ''))
	);
	if (!button) throw new Error(`No ${label} button`);
	await fireEvent.click(button);
};

describe('database-backed follow lists', () => {
	beforeEach(() => { Object.assign(page.data, { ...layoutData, session }); });
	afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.assign(page.data, layoutData); });

	it('community drawers fetch actual connections, not mock users', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([communityProfile])));
		vi.stubGlobal('fetch', fetcher);
		render(CommunityProfilePage, { props: { data: { ...layoutData, profile: communityProfile, events: [] } } });
		await openSheet('Followers');
		await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/profiles/p1/connections?kind=followers', expect.anything()));
		await waitFor(() => expect(document.querySelector('a[href="/users/drbello"]')).not.toBeNull());
		expect(screen.getAllByRole('button', { name: 'Follow' }).length).toBeGreaterThan(0);
	});

	it('own following drawer uses the signed-in profile id', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('[]'));
		vi.stubGlobal('fetch', fetcher);
		render(ProfilePage, { props: { data: ownProfileData } });
		await openSheet('Following');
		await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/profiles/u-ada/connections?kind=following', expect.anything()));
		await screen.findByText('Not following anyone yet.');
	});

	it('shows pending, empty, and failed list states with retry', async () => {
		let finish!: (response: Response) => void;
		const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
			.mockResolvedValueOnce(new Response('[]'));
		vi.stubGlobal('fetch', fetcher);
		render(ConnectionsSheet, { props: { open: true, profileId: 'p1', kind: 'followers', close: () => {} } });
		expect(screen.getByText('Loading people…')).toBeInTheDocument();
		finish(new Response('{}', { status: 503 }));
		await screen.findByRole('alert');
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		await screen.findByText('No followers yet.');
	});

	it('follow sends a desired state and blocks duplicate requests while saving', async () => {
		let finish!: (response: Response) => void;
		const fetcher = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
		vi.stubGlobal('fetch', fetcher);
		render(FollowButton, { props: { profileId: 'p1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
		expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
		expect(fetcher).toHaveBeenCalledWith('/api/profiles/p1/follow', expect.objectContaining({ method: 'PUT', body: '{"following":true}' }));
		finish(new Response('{"following":true}'));
		await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
	});

	it('refresh state comes from the server and unfollow sends false', async () => {
		Object.assign(page.data, { followingIds: ['p1'] });
		const fetcher = vi.fn().mockResolvedValue(new Response('{"following":false}'));
		vi.stubGlobal('fetch', fetcher);
		render(FollowButton, { props: { profileId: 'p1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Following' }));
		expect(fetcher).toHaveBeenCalledWith('/api/profiles/p1/follow', expect.objectContaining({ body: '{"following":false}' }));
	});

	it('does not display a follow button for yourself', () => {
		render(FollowButton, { props: { profileId: 'u-ada' } });
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('guest profile prompts sign-in and does not show dummy followers', () => {
		const { container } = render(ProfilePage, { props: { data: { ...ownProfileData, session: null } } });
		expect(container.textContent).toContain('Sign in to view your profile');
		expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
		expect(container.textContent).not.toContain('342');
	});
});

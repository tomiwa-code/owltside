import { cleanup, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from '../../src/routes/(app)/notifications/+page.svelte';
import { isAnnouncement } from '$lib/utils/announcements';
import { queryClient } from '$lib/query/cache';
import { page } from '$app/state';
import type { NotificationItem } from '$lib/types';

const at = new Date().toISOString();
const items: NotificationItem[] = [
	{
		id: 'platform-announcement',
		kind: 'announcement',
		title: 'Announcement · Community update',
		body: 'A platform-wide message from the admin team.',
		at,
		read: false
	},
	{
		id: 'organizer-announcement',
		kind: 'event',
		title: 'Announcement · Yaba Rooftop Sessions',
		body: 'Doors are now open.',
		href: '/events/yaba-rooftop-sessions',
		at,
		read: false
	},
	{
		id: 'ordinary-notification',
		kind: 'system',
		title: 'Security check complete',
		body: 'No announcement footer belongs on this notification.',
		at,
		read: true
	}
];

beforeEach(() => {
	page.data = { session: null };
	queryClient.invalidate('notifications');
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(items), {
		headers: { 'content-type': 'application/json' }
	})));
});

afterEach(() => {
	cleanup();
	queryClient.invalidate('notifications');
	vi.unstubAllGlobals();
});

describe('announcement social footer', () => {
	it('recognizes platform announcements and legacy organizer broadcasts only', () => {
		expect(isAnnouncement(items[0])).toBe(true);
		expect(isAnnouncement(items[1])).toBe(true);
		expect(isAnnouncement(items[2])).toBe(false);
	});

	it('is the final element of every announcement in both public Activity Hub layouts', async () => {
		render(NotificationsPage, {
			data: {
				items,
				session: null,
				demoMode: true,
				operatingIdentity: 'attendee' as const,
				unread: 0,
				inboxUnread: 0,
				currentProfile: null,
				followingIds: [],
				followLoadError: false
			}
		});
		await tick();

		for (const title of [items[0].title, items[1].title]) {
			// Desktop and mobile are both rendered; Tailwind controls which is visible.
			const headings = screen.getAllByRole('heading', { name: title });
			expect(headings).toHaveLength(2);
			for (const heading of headings) {
				const card = heading.closest('article');
				expect(card).not.toBeNull();
				const footer = within(card as HTMLElement).getByText('Follow for updates').closest('footer');
				expect(footer).not.toBeNull();
				expect(card?.lastElementChild).toBe(footer);
				for (const social of [
					{ name: 'Instagram', href: 'https://instagram.com/owltside' },
					{ name: 'X', href: 'https://x.com/owltsideng' },
					{ name: 'TikTok', href: 'https://tiktok.com/@owltsideng' }
				]) {
					const link = within(footer as HTMLElement).getByRole('link', {
						name: `Follow Owltside on ${social.name} (opens externally)`
					});
					expect(link).toHaveAttribute('href', social.href);
					expect(link).toHaveAttribute('target', '_blank');
					expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
				}
			}
		}

		for (const heading of screen.getAllByRole('heading', { name: items[2].title })) {
			const card = heading.closest('article') as HTMLElement;
			expect(within(card).queryByText('Follow for updates')).toBeNull();
		}
	});
});

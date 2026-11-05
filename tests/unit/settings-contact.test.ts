import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsContact from '$components/SettingsContact.svelte';
import SettingsPage from '../../src/routes/(app)/settings/+page.svelte';
import { page } from '../mocks/app-state';
import type { Session } from '$lib/types';

const contacts = [
	{ label: 'owltside.app@gmail.com', href: 'mailto:owltside.app@gmail.com' },
	{ label: '+2349071401036', href: 'tel:+2349071401036' }
];
const socials = [
	{ name: 'Instagram', href: 'https://instagram.com/owltside' },
	{ name: 'X', href: 'https://x.com/owltsideng' },
	{ name: 'TikTok', href: 'https://tiktok.com/@owltsideng' }
];
const session: Session = {
	userId: 'contact-test-user',
	name: 'Ada Example',
	email: 'ada@example.com',
	handle: 'ada',
	role: 'attendee'
};
const originalData = page.data;
const originalUrl = page.url;

beforeEach(() => {
	page.data = { session: null };
	page.url = new URL('http://localhost/settings');
});

afterEach(() => {
	cleanup();
	page.data = originalData;
	page.url = originalUrl;
});

describe('settings contact and social links', () => {
	it('labels both sections clearly', () => {
		render(SettingsContact);

		expect(screen.getByRole('heading', { name: 'Contact us', level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Follow for updates', level: 2 })).toBeInTheDocument();
	});

	it.each(contacts)('shows $label with an icon and a native contact link', ({ label, href }) => {
		render(SettingsContact);

		const link = within(screen.getByRole('region', { name: 'Contact us' })).getByRole('link', { name: label });
		expect(link).toHaveAttribute('href', href);
		expect(link).toHaveTextContent(label);
		expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
	});

	it.each(socials)('links the icon-only $name control to the requested profile', ({ name, href }) => {
		render(SettingsContact);

		const link = within(screen.getByRole('region', { name: 'Follow for updates' })).getByRole('link', {
			name: `Follow Owltside on ${name} (opens externally)`
		});
		expect(link).toHaveAttribute('href', href);
		expect(link).toHaveAttribute('target', '_blank');
		for (const token of ['noopener', 'noreferrer', 'external']) {
			expect(link.getAttribute('rel')?.split(' ')).toContain(token);
		}
		expect(link.textContent?.trim()).toBe('');
		expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
		expect(link.querySelector('svg')).toHaveAttribute('focusable', 'false');
		expect(link.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
	});

	it('keeps every contact and social link keyboard reachable', async () => {
		const user = userEvent.setup();
		render(SettingsContact);

		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(5);
		for (const link of links) {
			await user.tab();
			expect(link).toHaveFocus();
		}
	});
});

describe('public settings integration', () => {
	it.each([
		{ label: 'guests', session: null },
		{ label: 'signed-in users', session }
	])('includes the sections in mobile and desktop settings for $label', ({ session }) => {
		const data = {
			session,
			demoMode: true,
			operatingIdentity: 'attendee' as const,
			unread: 0,
			inboxUnread: 0,
			currentProfile: null,
			followingIds: [] as string[],
			followLoadError: false,
			approvals: []
		};
		page.data = data;
		const { container } = render(SettingsPage, { data });

		// Both responsive layouts exist in the DOM; Tailwind shows only the matching one.
		const desktop = container.querySelector<HTMLElement>('.md\\:flex');
		const mobile = container.querySelector<HTMLElement>('.md\\:hidden');
		expect(desktop).not.toBeNull();
		expect(mobile).not.toBeNull();
		for (const layout of [desktop!, mobile!]) {
			const contactSection = within(layout).getByRole('region', { name: 'Contact us' });
			const socialSection = within(layout).getByRole('region', { name: 'Follow for updates' });
			for (const { label, href } of contacts) {
				expect(within(contactSection).getByRole('link', { name: label })).toHaveAttribute('href', href);
			}
			for (const { name, href } of socials) {
				expect(within(socialSection).getByRole('link', {
					name: `Follow Owltside on ${name} (opens externally)`
				})).toHaveAttribute('href', href);
			}
		}
	});
});

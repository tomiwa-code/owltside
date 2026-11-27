import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import LegalPage from '../../src/routes/legal/+page.svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';

afterEach(() => {
	cleanup();
});

describe('Owltside Nigeria legal policies (/legal)', () => {
	it('renders all four rewritten policies plus cookies and licenses with accessible section anchors', () => {
		const { container } = render(LegalPage);

		const nav = screen.getByRole('navigation', { name: 'Legal sections' });
		for (const [label, href] of [
			['Refund Policy', '#refunds'],
			['Terms of Use', '#terms'],
			['Privacy Policy', '#privacy'],
			['Ticket Services Agreement', '#tsa'],
			['Cookies & Local Storage', '#cookies'],
			['Licenses & Attribution', '#licenses']
		] as const) {
			expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href);
			expect(container.querySelector(href)).not.toBeNull();
		}

		expect(screen.getByRole('heading', { name: /Refund Policy/i, level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Terms of Use/i, level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Privacy Policy/i, level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Ticket Services Agreement/i, level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Cookies & Local Storage/i, level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Licenses & attribution/i, level: 2 })).toBeInTheDocument();
	});

	it('enforces Nigeria-only scope, NGN currency, Nigerian statutes, and Owltside product specifics without leftover Tix details', () => {
		const { container } = render(LegalPage);
		const text = container.textContent ?? '';

		// Nigeria-only jurisdiction & legal framework
		expect(text).toContain('exclusively within the Federal Republic of Nigeria');
		expect(text).toContain('Nigerian Naira');
		expect(text).toContain('Nigeria Data Protection Act, 2023');
		expect(text).toContain('Nigeria Data Protection Commission');
		expect(text).toContain('Arbitration and Mediation Act, 2023');
		expect(text).toContain('Lagos');

		// Owltside product features reflected across policies
		expect(text).toContain('6-digit Email One-Time Passcodes (OTP)');
		expect(text).toContain('Google OAuth');
		expect(text).toContain('rotate every 30 seconds');
		expect(text).toContain('seventy-two (72) hours');
		expect(text).toContain('1-to-1');
		expect(text).toContain('Paystack');
		expect(text).toContain('NUBAN');
		expect(text).toContain('Held Balance');
		expect(text).toContain('Payable Balance');
		expect(text).toContain('Pending Approval');

		// Official Owltside contacts
		const mailLinks = container.querySelectorAll('a[href="mailto:owltside.app@gmail.com"]');
		const telLinks = container.querySelectorAll('a[href="tel:+2349071401036"]');
		expect(mailLinks.length).toBeGreaterThan(0);
		expect(telLinks.length).toBeGreaterThan(0);

		// Zero leftover Tix / Festival Coins / placeholder references
		expect(text).not.toMatch(/Festival Coins/i);
		expect(text).not.toMatch(/tix\.africa/i);
		expect(text).not.toMatch(/1537258/);
		expect(text).not.toMatch(/Turnbull/i);
		expect(text).not.toMatch(/support@owltside\.app/i);
		expect(text).not.toMatch(/privacy@owltside\.app/i);
		expect(text).not.toContain('Policy draft:');
	});
});

describe('Settings → Help & Legal links', () => {
	it('links directly to Refund Policy, Terms of Use, Privacy Policy, and Ticket Services Agreement', () => {
		render(SettingsDetails, { category: 'help' });

		expect(screen.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute('href', '/legal#refunds');
		expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/legal#terms');
		expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/legal#privacy');
		expect(screen.getByRole('link', { name: 'Ticket Services Agreement' })).toHaveAttribute('href', '/legal#tsa');
		expect(screen.getByRole('link', { name: 'Cookie settings & policy' })).toHaveAttribute('href', '/legal#cookies');
		expect(screen.getByRole('link', { name: 'Licenses & attribution' })).toHaveAttribute('href', '/legal#licenses');
		expect(screen.getByRole('link', { name: /Help Center/i })).toHaveAttribute(
			'href',
			'mailto:owltside.app@gmail.com?subject=Owltside%20Support'
		);
	});
});

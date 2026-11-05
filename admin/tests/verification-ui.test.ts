import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import UserVerification from '../src/lib/components/UserVerification.svelte';
import UserProfile from '../src/routes/(console)/users/[id]/+page.svelte';
import type { AdminSession, AdminUser } from '../src/lib/types';

const admin: AdminSession = {
	id: 'admin-1', name: 'Review Admin', email: 'admin@example.com', initials: 'RA', role: 'Trust & Safety Lead', tier: 1, auth: 'password+totp', demo: false, ip: '127.0.0.1', issuedAt: '2026-11-01T10:00:00Z', expiresAt: '2026-12-01T10:00:00Z'
};

const user: AdminUser = {
	id: '11111111-2222-4333-8444-555555555555', name: 'Member', handle: 'member',
	email: 'member@example.com', emailVerified: true, emailVerifiedAt: '2026-11-01T10:00:00Z',
	phone: '+2348031234567', phoneStatus: 'pending', role: 'Attendee', kycTier: 0,
	spendNgn: 0, ticketsCount: 0, ordersCount: 0, status: 'active', city: 'Lagos',
	joinedAt: '2026-11-01T10:00:00Z', lastSeenAt: '2026-11-01T10:00:00Z'
};

// Remove SSR markers so status labels can be asserted without implementation-specific HTML.
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('admin user profile verification panel', () => {
	it('shows registration email verification even when KYC is not verified', () => {
		const html = render(UserVerification, { props: { user } }).body;
		expect(text(html)).toMatch(/Email address Verified Phone number Pending review Identity Not verified/);
		expect(html).toContain('Confirmed 2026-11-01T10:00:00Z');
	});

	it('shows unconfirmed email honestly and hides mutation controls for auditors', () => {
		const html = render(UserVerification, { props: { user: { ...user, emailVerified: false, emailVerifiedAt: undefined, kycStatus: 'approved' }, canRequest: false } }).body;
		expect(text(html)).toContain('Email address Not verified');
		expect(text(html)).not.toContain('Re-verify');
	});

	it('provides Re-verify for an admin and distinguishes pending review from awaiting user', () => {
		const html = render(UserVerification, { props: { user: { ...user, kycStatus: 'approved', bankStatus: 'reverification_required' }, canRequest: true } }).body;
		expect(text(html)).toContain('Re-verify');
		expect(text(html)).toContain('Identity Verified Payout account Awaiting user');
		expect(html).not.toMatch(/<button[^>]*disabled/);
	});

	it('disables Re-verify when there is no approved identity or bank check', () => {
		const html = render(UserVerification, { props: { user: { ...user, kycStatus: 'pending', bankStatus: 'reverification_required' }, canRequest: true } }).body;
		expect(html).toMatch(/<button[^>]*disabled/);
	});

	it('includes email status and the re-verification control in the full user profile', () => {
		const html = render(UserProfile, { props: { data: { user: { ...user, kycStatus: 'approved' }, admin, tickets: [], orders: [], audit: [], source: 'supabase', mode: 'live', notifications: [], counts: { pendingEvents: 0, refunds: 0, approvals: 0, reports: 0, moderation: 0, notifications: 0 }, serverTime: '2026-11-05T12:00:00Z', publicAppUrl: 'https://public.example.com' } } }).body;
		expect(text(html)).toContain('Email address Verified');
		expect(text(html)).toContain('Re-verify');
	});
});

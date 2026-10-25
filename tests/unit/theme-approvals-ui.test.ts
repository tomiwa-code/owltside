import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from '$components/ThemeToggle.svelte';
import ApprovalNotice from '$components/ApprovalNotice.svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import { appSettings } from '$lib/state/settings.svelte';
import type { ApprovalRequest } from '$lib/types';

const approval = (overrides: Partial<ApprovalRequest>): ApprovalRequest => ({
	id: 'ap-1',
	kind: 'verification',
	status: 'pending',
	requesterId: 'u-ada',
	title: 'Identity verification',
	summary: 'NIN submitted for review',
	createdAt: new Date().toISOString(),
	...overrides
});

beforeEach(() => {
	appSettings.value.accessibility.appearance = 'dark';
	appSettings.value.verification.identity = false;
	appSettings.value.verification.payoutAccount = false;
});

afterEach(() => {
	cleanup();
	document.documentElement.removeAttribute('data-theme');
	appSettings.value.accessibility.appearance = 'dark';
	appSettings.value.verification.identity = false;
	appSettings.value.verification.payoutAccount = false;
});

describe('one-tap theme toggle', () => {
	it('switches to light mode from the app chrome and stores the choice', async () => {
		render(ThemeToggle);
		const button = screen.getByRole('button', { name: 'Switch to light mode' });
		expect(button).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.click(button);

		expect(appSettings.value.accessibility.appearance).toBe('light');
		expect(document.documentElement.dataset.theme).toBe('light');
		expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
	});
});

describe('pending approval notices', () => {
	it('renders a pending state without implying approval', () => {
		render(ApprovalNotice, { request: approval({}) });
		expect(screen.getByText('Pending approval')).toBeInTheDocument();
		expect(screen.queryByText(/^Approved/)).not.toBeInTheDocument();
	});

	it('shows the admin note once a request is decided', () => {
		render(ApprovalNotice, {
			request: approval({ status: 'rejected', note: 'The NIN slip was cropped.' })
		});
		expect(screen.getByText('Request declined')).toBeInTheDocument();
		expect(screen.getByText('The NIN slip was cropped.')).toBeInTheDocument();
	});

	it('never renders anything when there is no request', () => {
		const { container } = render(ApprovalNotice, { request: null });
		expect(container.textContent?.trim()).toBe('');
	});
});

describe('verification waiting on an admin', () => {
	it('reads "Pending review" instead of "Verified" for a submitted identity check', () => {
		render(SettingsDetails, {
			category: 'verification',
			approvals: [approval({ payload: { check: 'identity' } })]
		});
		expect(screen.getByText('Pending review')).toBeInTheDocument();
		expect(screen.getByText('Identity pending admin review')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'In review' })).toBeDisabled();
	});

	it('counts an admin-approved check as verified', () => {
		render(SettingsDetails, {
			category: 'verification',
			approvals: [approval({ status: 'approved', payload: { check: 'identity' } })]
		});
		expect(screen.getAllByText('Verified').length).toBeGreaterThan(1);
	});
});

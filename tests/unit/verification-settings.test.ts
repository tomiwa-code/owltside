import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import { appSettings } from '$lib/state/settings.svelte';
import { approvedPayoutAccount, latestVerificationRequest, verificationChecks } from '$lib/utils/verification';
import { verificationApproval } from '../fixtures/verification';

beforeEach(() => {
	appSettings.value.verification.phone = false;
	appSettings.value.verification.identity = false;
	appSettings.value.verification.payoutAccount = false;
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	appSettings.value.verification.phone = false;
	appSettings.value.verification.identity = false;
	appSettings.value.verification.payoutAccount = false;
});

describe('phone submissions, without OTP or self-approval', () => {
	async function openPhone() {
		render(SettingsDetails, { category: 'verification' });
		await fireEvent.click(screen.getByRole('button', { name: 'Submit phone number' }));
		return within(screen.getByRole('dialog', { name: 'Verify Phone Number' }));
	}

	it('submits the number as pending and waits for admin approval', async () => {
		const request = verificationApproval('phone', 'pending');
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(request), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const sheet = await openPhone();
		expect(sheet.queryByRole('button', { name: /otp|code|resend/i })).not.toBeInTheDocument();
		expect(sheet.queryByLabelText(/otp/i)).not.toBeInTheDocument();
		await fireEvent.input(sheet.getByRole('textbox', { name: 'Phone number' }), { target: { value: '+234 803 123 4567' } });
		await fireEvent.click(sheet.getByRole('button', { name: 'Submit' }));
		await waitFor(() => expect(screen.getByText('Phone number pending admin review')).toBeInTheDocument());
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kind: 'verification', check: 'phone', details: { phone: '+2348031234567' } });
		expect(appSettings.value.verification.phone).toBe(false);
		expect(screen.getByRole('heading', { name: '1. Phone Number Pending review' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Submit phone number' })).toBeDisabled();
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('validates Nigerian numbers before sending anything', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const sheet = await openPhone();
		await fireEvent.input(sheet.getByRole('textbox'), { target: { value: '+234123' } });
		await fireEvent.click(sheet.getByRole('button', { name: 'Submit' }));
		expect(sheet.getByRole('alert')).toHaveTextContent('Enter a valid Nigerian number');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(['server', 'network'])('keeps the sheet open and unverified on a %s error', async (failure) => {
		const fetchMock = failure === 'server'
			? vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Please try again later.' }), { status: 503 }))
			: vi.fn().mockRejectedValue(new Error('offline'));
		vi.stubGlobal('fetch', fetchMock);
		const sheet = await openPhone();
		await fireEvent.input(sheet.getByRole('textbox'), { target: { value: '+2348031234567' } });
		await fireEvent.click(sheet.getByRole('button', { name: 'Submit' }));
		await waitFor(() => expect(sheet.getByRole('alert')).toBeInTheDocument());
		expect(sheet.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
		expect(appSettings.value.verification.phone).toBe(false);
		expect(screen.queryByText('Pending review')).not.toBeInTheDocument();
	});

	it('disables the number and submit controls while a request is in flight', async () => {
		let resolve!: (response: Response) => void;
		const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
		vi.stubGlobal('fetch', fetchMock);
		const sheet = await openPhone();
		await fireEvent.input(sheet.getByRole('textbox'), { target: { value: '+2348031234567' } });
		await fireEvent.click(sheet.getByRole('button', { name: 'Submit' }));
		expect(sheet.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
		expect(sheet.getByRole('textbox')).toBeDisabled();
		await fireEvent.click(sheet.getByRole('button', { name: 'Submitting…' }));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		resolve(new Response(JSON.stringify(verificationApproval('phone', 'pending')), { status: 201 }));
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('shows the approved phone number after a reload, with no re-verify action', () => {
		render(SettingsDetails, { category: 'verification', approvals: [verificationApproval('phone')] });
		expect(screen.getByRole('heading', { name: '1. Phone Number Verified' })).toBeInTheDocument();
		expect(screen.getByText('+2348031234567 verified')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Submit phone number' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /re-verify/i })).not.toBeInTheDocument();
	});

	it('shows the rejection reason and permits a corrected phone submission', async () => {
		render(SettingsDetails, { category: 'verification', approvals: [verificationApproval('phone', 'rejected', { note: 'Please use your registered number.' })] });
		expect(screen.getByText('Please use your registered number.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Submit phone number' }));
		expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue('+2348031234567');
	});
});

describe('only admins can initiate re-verification', () => {
	it('ignores old local verification flags when there is no approval', () => {
		Object.assign(appSettings.value.verification, { phone: true, identity: true, payoutAccount: true });
		render(SettingsDetails, { category: 'verification' });
		expect(screen.getByText('2/5 checks verified')).toBeInTheDocument();
		expect(screen.getAllByText('Not Verified')).toHaveLength(3);
	});

	it('removes all self-service re-verify controls from approved checks', () => {
		render(SettingsDetails, { category: 'verification', approvals: ['phone', 'identity', 'payoutAccount'].map((check) => verificationApproval(check as 'phone' | 'identity' | 'payoutAccount')) });
		expect(screen.getByText('5/5 checks verified')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /re-verify|start|submit|add payout/i })).not.toBeInTheDocument();
	});

	it('an admin identity request overrides historical approvals and local flags, not other checks', async () => {
		Object.assign(appSettings.value.verification, { phone: true, identity: true, payoutAccount: true });
		const required = verificationApproval('identity', 'reverification_required', { createdAt: '2026-11-01T00:00:00Z', note: 'Upload a current ID with readable details.' });
		const approvals = [required, verificationApproval('identity'), verificationApproval('phone'), verificationApproval('payoutAccount')];
		const view = render(SettingsDetails, { category: 'verification', approvals });
		expect(screen.getByText('4/5 checks verified')).toBeInTheDocument();
		expect(screen.getByText('Upload a current ID with readable details.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Add payout account' })).not.toBeInTheDocument();

		const pending = verificationApproval('identity', 'pending', { createdAt: '2026-11-02T00:00:00Z' });
		await view.rerender({ category: 'verification', approvals: [pending, ...approvals] });
		expect(screen.getByRole('button', { name: 'In review' })).toBeDisabled();
		expect(screen.queryByText('Upload a current ID with readable details.')).not.toBeInTheDocument();

		await view.rerender({ category: 'verification', approvals: [{ ...pending, status: 'approved' }, ...approvals] });
		expect(screen.getByText('5/5 checks verified')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /re-verify|start/i })).not.toBeInTheDocument();
	});
});

describe('latest server verification state', () => {
	it('resolves the most recent check even when input is not sorted', () => {
		const approved = verificationApproval('payoutAccount');
		const required = verificationApproval('payoutAccount', 'reverification_required', { createdAt: '2026-11-01T00:00:00Z', payload: { check: 'payoutAccount' } });
		expect(latestVerificationRequest([approved, required], 'payoutAccount')).toBe(required);
		expect(approvedPayoutAccount([approved, required])).toBeNull();
		expect(verificationChecks([approved, required, verificationApproval('identity')])).toEqual({ phone: false, identity: true, payoutAccount: false });
	});

	it('restores only the new bank details after fresh approval', () => {
		const updated = verificationApproval('payoutAccount', 'approved', { id: 'new-bank', createdAt: '2026-11-03T00:00:00Z', payload: { check: 'payoutAccount', bank: 'Zenith Bank', accountNumber: '9876543210' } });
		expect(approvedPayoutAccount([verificationApproval('payoutAccount'), updated])).toEqual({ bank: 'Zenith Bank', accountNumber: '9876543210' });
	});
});

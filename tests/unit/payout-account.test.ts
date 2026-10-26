import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import { appSettings } from '$lib/state/settings.svelte';
import {
	isValidNuban,
	maskAccountNumber,
	normaliseNuban,
	payoutAccountLabel,
	payoutBankMark
} from '$lib/utils/payout';

const EMPTY_PAYOUT = { bank: '', accountNumber: '' };

describe('payout account helpers', () => {
	it('accepts only complete 10-digit NUBANs', () => {
		expect(isValidNuban('0123456789')).toBe(true);
		expect(isValidNuban(' 0123456789 ')).toBe(true);
		expect(isValidNuban('012345678')).toBe(false);
		expect(isValidNuban('01234567890')).toBe(false);
		expect(isValidNuban('01234abcde')).toBe(false);
		expect(isValidNuban('')).toBe(false);
	});

	it('normalises pasted numbers to ten digits', () => {
		expect(normaliseNuban('012 345-6789')).toBe('0123456789');
		expect(normaliseNuban('01234567891234')).toBe('0123456789');
		expect(normaliseNuban('abc')).toBe('');
	});

	it('only ever exposes the last four digits', () => {
		expect(maskAccountNumber('0123456789')).toBe('••••6789');
		expect(maskAccountNumber('12')).toBe('••••');
		expect(payoutAccountLabel({ bank: 'GTBank', accountNumber: '0123456789' })).toBe('GTBank ••••6789');
		expect(payoutAccountLabel(EMPTY_PAYOUT)).toBe('No payout account linked');
	});

	it('gives settlement cards a bank mark', () => {
		expect(payoutBankMark('GTBank')).toBe('GTB');
		expect(payoutBankMark('Access Bank')).toBe('ACC');
		expect(payoutBankMark('')).toBe('—');
	});
});

describe('payout account verification in settings', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
	});

	afterEach(() => {
		vi.useRealTimers();
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
	});

	/** Open the payout sheet and fill in a bank + account number. */
	async function fillPayout(accountNumber = '0123456789') {
		render(SettingsDetails, { category: 'verification' });
		await fireEvent.click(screen.getByRole('button', { name: 'Add payout account' }));
		await fireEvent.change(screen.getByLabelText('Bank Name'), { target: { value: 'GTBank' } });
		const input = screen.getByLabelText(/10-digit NUBAN Account Number/);
		await fireEvent.input(input, { target: { value: accountNumber } });
		return input;
	}

	it('submits the account for admin review instead of self-verifying it', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'ap-verify-1', status: 'pending' }), {
				status: 201,
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		await fillPayout();

		const save = screen.getByRole('button', { name: 'Verify and save payout account' });
		expect(save).not.toBeDisabled();
		// Nothing is stored until the user confirms.
		expect(appSettings.value.payout).toEqual(EMPTY_PAYOUT);

		await fireEvent.click(save);
		await vi.advanceTimersByTimeAsync(0);

		// The request goes to the admin console; the public app never self-approves.
		expect(fetchMock).toHaveBeenCalledWith('/api/approvals', expect.objectContaining({ method: 'POST' }));
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body).toMatchObject({
			kind: 'verification',
			check: 'payoutAccount',
			details: { bank: 'GTBank', accountNumber: '0123456789' }
		});
		expect(appSettings.value.payout).toEqual({ bank: 'GTBank', accountNumber: '0123456789' });
		// Still unverified: only an admin decision flips this.
		expect(appSettings.value.verification.payoutAccount).toBe(false);
		expect(screen.queryByText('Verify Payout Account')).not.toBeInTheDocument();
		vi.unstubAllGlobals();
	});

	it('does not show or ask for an account name anywhere in the sheet', async () => {
		await fillPayout('9876543210');

		const sheet = document.body.textContent ?? '';
		expect(sheet).not.toMatch(/account name/i);
		expect(sheet).not.toMatch(/resolving/i);
		expect(sheet).not.toMatch(/NIBSS/i);
	});

	it('will not save until a bank and a full account number are present', async () => {
		render(SettingsDetails, { category: 'verification' });
		await fireEvent.click(screen.getByRole('button', { name: 'Add payout account' }));
		const save = screen.getByRole('button', { name: 'Verify and save payout account' });

		// No bank and no number: the hint explains what is missing.
		expect(screen.getByText(/Choose your bank and enter the 10-digit account number/)).toBeInTheDocument();
		await fireEvent.click(save);
		expect(appSettings.value.payout).toEqual(EMPTY_PAYOUT);

		await fireEvent.change(screen.getByLabelText('Bank Name'), { target: { value: 'GTBank' } });
		const input = screen.getByLabelText(/10-digit NUBAN Account Number/);
		await fireEvent.input(input, { target: { value: '012345678' } });

		expect(screen.getByText(/9\/10 digits/)).toBeInTheDocument();
		await fireEvent.click(save);
		expect(screen.getByText('Enter a valid 10-digit NUBAN account number.')).toBeInTheDocument();
		expect(appSettings.value.payout).toEqual(EMPTY_PAYOUT);
	});

	it('asks for a bank when only the account number is filled in', async () => {
		render(SettingsDetails, { category: 'verification' });
		await fireEvent.click(screen.getByRole('button', { name: 'Add payout account' }));
		await fireEvent.input(screen.getByLabelText(/10-digit NUBAN Account Number/), {
			target: { value: '0123456789' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Verify and save payout account' }));
		expect(screen.getByText('Select your bank.')).toBeInTheDocument();
		expect(appSettings.value.payout).toEqual(EMPTY_PAYOUT);
	});

	it('reopens a verified account prefilled and ready to save again', async () => {
		appSettings.value.verification.payoutAccount = true;
		appSettings.value.payout = { bank: 'Zenith Bank', accountNumber: '1234567890' };

		render(SettingsDetails, { category: 'verification' });
		await fireEvent.click(screen.getByRole('button', { name: 'Re-verify payout account' }));

		expect(screen.getByLabelText('Bank Name')).toHaveValue('Zenith Bank');
		expect(screen.getByLabelText(/10-digit NUBAN Account Number/)).toHaveValue('1234567890');
		expect(screen.getByRole('button', { name: 'Verify and save payout account' })).not.toBeDisabled();
	});
});

describe('settlement surfaces read the verified account', () => {
	const event = {
		id: 'e1',
		status: 'published' as const,
		slug: 'test-event',
		title: 'Test Event',
		category: 'music',
		tags: [],
		startsAt: new Date(Date.now() + 86_400_000).toISOString(),
		endsAt: new Date(Date.now() + 90_000_000).toISOString(),
		venue: 'Some Venue',
		city: 'Lagos',
		cover: { from: '#123', to: '#456', icon: 'music', src: undefined },
		description: 'A long enough description for the wizard validation.',
		organizer: { id: 'o1', handle: 'org', name: 'Org', avatarColor: '#fff', followers: 1, following: 1 },
		speakers: [],
		agenda: [],
		tiers: [{ id: 't1', name: 'General', price: 15_000, sold: 10, capacity: 100 }],
		faqs: [],
		policies: [],
		viewsToday: 10,
		attendees: 10,
		gates: [],
		promos: [],
		live: false
	};

	// Shared page payload required by the generated route types.
	const baseData = {
		unread: 0,
		inboxUnread: 0,
		operatingIdentity: 'organizer' as const,
		session: null,
		demoMode: true,
		currentProfile: null,
		followingIds: [] as string[],
		followLoadError: false
	};

	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		appSettings.value.verification.payoutAccount = true;
		appSettings.value.payout = { bank: 'GTBank', accountNumber: '0123456789' };
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
	});

	it('shows the verified account on the organizer dashboard', async () => {
		const { default: OrganizerPage } = await import('../../src/routes/(app)/organizer/+page.svelte');
		const { computeOrganizer } = await import('$lib/server/datasource');
		render(OrganizerPage, { data: { ...baseData, payload: computeOrganizer([], [], [], []) } });

		const text = document.body.textContent ?? '';
		expect(text).toContain('Settlement Account');
		expect(text).toContain('Account: ••••6789');
	});

	it("shows the verified account in the event wizard's Issuance & Settlement", async () => {
		const { default: CreatePage } = await import('../../src/routes/(app)/organizer/create/+page.svelte');
		render(CreatePage, { data: { ...baseData, owner: 'u-ada', event }, form: null });
		await tick();

		await fireEvent.click(screen.getAllByRole('button', { name: /Next: Step 2/ })[0]);

		const text = document.body.textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text).toContain('Issuance & Settlement');
		expect(text).toContain('GTBank · ••••6789');
	});

	it('never falls back to a hardcoded bank when no payout account is verified', async () => {
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
		const { default: CreatePage } = await import('../../src/routes/(app)/organizer/create/+page.svelte');
		render(CreatePage, { data: { ...baseData, owner: 'u-ada', event }, form: null });
		await tick();

		await fireEvent.click(screen.getAllByRole('button', { name: /Next: Step 2/ })[0]);

		const text = document.body.textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text).toContain('No payout account linked');
		expect(text).not.toContain('GTB · •••• 4821');
	});
});

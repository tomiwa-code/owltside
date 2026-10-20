import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import { page } from '$app/state';
import { appSettings } from '$lib/state/settings.svelte';
import {
	PAYOUT_LOOKUP_MS,
	PAYOUT_SAVE_MS,
	isValidNuban,
	lookupAccountName,
	maskAccountNumber,
	normaliseNuban,
	payoutAccountLabel,
	payoutBankMark
} from '$lib/utils/payout';

const setSession = (session: Record<string, unknown> | null) => {
	(page.data as Record<string, unknown>).session = session;
};

const EMPTY_PAYOUT = { bank: '', accountNumber: '', accountName: '' };

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
		expect(payoutAccountLabel({ bank: 'GTBank', accountNumber: '0123456789', accountName: 'ADA OBI' })).toBe(
			'GTBank ••••6789'
		);
		expect(payoutAccountLabel(EMPTY_PAYOUT)).toBe('No payout account linked');
	});

	it('gives settlement cards a bank mark', () => {
		expect(payoutBankMark('GTBank')).toBe('GTB');
		expect(payoutBankMark('Access Bank')).toBe('ACC');
		expect(payoutBankMark('')).toBe('—');
	});

	it('resolves the account holder name from the bank enquiry', () => {
		expect(lookupAccountName('GTBank', '0123456789', 'Ada Obi')).toBe('ADA OBI');
		expect(lookupAccountName('GTBank', '0123456789', '  ada   obi ')).toBe('ADA OBI');
		expect(lookupAccountName('GTBank', '012345678', 'Ada Obi')).toBeNull();
		expect(lookupAccountName('', '0123456789', 'Ada Obi')).toBeNull();
		expect(lookupAccountName('GTBank', '0123456789', '')).toBeNull();
	});
});

describe('payout account verification in settings', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setSession({ userId: 'u-ada', name: 'Ada Obi', role: 'attendee' });
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
	});

	afterEach(() => {
		vi.useRealTimers();
		setSession(null);
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

	it('shows the account name before the user verifies or saves', async () => {
		await fillPayout();

		// While the enquiry runs the save action stays unavailable.
		expect(screen.getByText(/Resolving account name/)).toBeInTheDocument();
		const save = screen.getByRole('button', { name: 'Verify and save payout account' });
		expect(save).toBeDisabled();

		await vi.advanceTimersByTimeAsync(PAYOUT_LOOKUP_MS + 10);

		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();
		expect(save).not.toBeDisabled();
		expect(save).toHaveTextContent('Verify & save payout account');
		// Nothing is stored until the user confirms.
		expect(appSettings.value.payout).toEqual(EMPTY_PAYOUT);
		expect(appSettings.value.verification.payoutAccount).toBe(false);
	});

	it('does not look up anything until a full account number is present', async () => {
		const input = await fillPayout('012345678');

		expect(screen.queryByText(/Resolving account name/)).not.toBeInTheDocument();
		expect(screen.getByText(/9\/10 digits/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Verify and save payout account' })).toBeDisabled();

		// Completing the number starts the enquiry automatically.
		await fireEvent.input(input, { target: { value: '0123456789' } });
		expect(screen.getByText(/Resolving account name/)).toBeInTheDocument();
	});

	it('clears a resolved name as soon as the account is edited', async () => {
		const input = await fillPayout();
		await vi.advanceTimersByTimeAsync(PAYOUT_LOOKUP_MS + 10);
		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();

		await fireEvent.input(input, { target: { value: '0123456788' } });

		expect(screen.queryByText(/Account name: ADA OBI/)).not.toBeInTheDocument();
		expect(screen.getByText(/Resolving account name/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Verify and save payout account' })).toBeDisabled();
	});

	it('saves the verified account and shows it on the verification card', async () => {
		await fillPayout();
		await vi.advanceTimersByTimeAsync(PAYOUT_LOOKUP_MS + 10);
		await fireEvent.click(screen.getByRole('button', { name: 'Verify and save payout account' }));

		expect(screen.getByText(/Saving payout account/)).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(PAYOUT_SAVE_MS + 10);

		expect(appSettings.value.payout).toEqual({
			bank: 'GTBank',
			accountNumber: '0123456789',
			accountName: 'ADA OBI'
		});
		expect(appSettings.value.verification.payoutAccount).toBe(true);
		// The sheet closes and the card above now names the live account.
		expect(screen.queryByText('Verify Payout Account')).not.toBeInTheDocument();
		// The card above now names the live account (the text is split by the check icon).
		expect(document.body.textContent).toContain('GTBank ••••6789 verified · ADA OBI');
	});

	it('reopens a verified account ready to save again', async () => {
		appSettings.value.verification.payoutAccount = true;
		appSettings.value.payout = { bank: 'Zenith Bank', accountNumber: '1234567890', accountName: 'ADA OBI' };

		render(SettingsDetails, { category: 'verification' });
		await fireEvent.click(screen.getByRole('button', { name: 'Re-verify payout account' }));

		expect(screen.getByLabelText('Bank Name')).toHaveValue('Zenith Bank');
		expect(screen.getByLabelText(/10-digit NUBAN Account Number/)).toHaveValue('1234567890');
		// The saved name appears immediately — no enquiry, no waiting.
		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Verify and save payout account' })).not.toBeDisabled();
	});
});

describe('settlement surfaces read the verified account', () => {
	const event = {
		id: 'e1',
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
		appSettings.value.payout = { bank: 'GTBank', accountNumber: '0123456789', accountName: 'ADA OBI' };
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
		expect(text).toContain('ADA OBI');
	});

	it('shows the verified account in the event wizard\'s Issuance & Settlement', async () => {
		const { default: CreatePage } = await import('../../src/routes/(app)/organizer/create/+page.svelte');
		render(CreatePage, { data: { ...baseData, owner: 'u-ada', event }, form: null });
		await tick();

		await fireEvent.click(screen.getAllByRole('button', { name: /Next: Step 2/ })[0]);

		const text = document.body.textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text).toContain('Issuance & Settlement');
		expect(text).toContain('GTBank · ••••6789');
		expect(text).toContain('ADA OBI');
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

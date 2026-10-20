import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import { page } from '$app/state';
import { appSettings } from '$lib/state/settings.svelte';
import {
	PAYOUT_LOOKUP_MS,
	PAYOUT_SAVE_MS,
	DEMO_ACCOUNT_DIRECTORY,
	isValidNuban,
	maskAccountNumber,
	namesMatch,
	normaliseNuban,
	payoutAccountLabel,
	payoutBankMark,
	resolveAccountName
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

	it('resolves the name of the account, not of whoever is signed in', () => {
		// The placeholder account belongs to the demo identity.
		expect(resolveAccountName('GTBank', '0123456789')).toBe('ADA OBI');
		// A different account number is a different person, at the same bank.
		expect(resolveAccountName('GTBank', '9876543210')).toBe('AMINA BELLO');
		expect(resolveAccountName('Zenith Bank', '4455667788')).toBe('CHIAMAKA OKAFOR');
	});

	it('never returns one account holder for every account', () => {
		const numbers = ['1111111111', '2222222222', '3333333333', '4444444444', '5555555555', '6666666666'];
		const names = numbers.map((nuban) => resolveAccountName('GTBank', nuban));
		expect(new Set(names).size).toBeGreaterThan(1);
		expect(names).not.toContain(null);
	});

	it('is deterministic for a given bank and account number', () => {
		const first = resolveAccountName('Access Bank', '8064512397');
		expect(first).not.toBeNull();
		expect(resolveAccountName('Access Bank', '8064512397')).toBe(first);
		// The same digits at another bank are another account.
		expect(typeof resolveAccountName('Kuda', '8064512397')).toBe('string');
	});

	it('returns nothing until the details can be looked up', () => {
		expect(resolveAccountName('GTBank', '012345678')).toBeNull();
		expect(resolveAccountName('', '0123456789')).toBeNull();
		expect(resolveAccountName('GTBank', '')).toBeNull();
	});

	it('publishes its demo accounts so they can be used in the app', () => {
		expect(Object.keys(DEMO_ACCOUNT_DIRECTORY)).toContain('0123456789');
		for (const nuban of Object.keys(DEMO_ACCOUNT_DIRECTORY)) expect(isValidNuban(nuban)).toBe(true);
	});

	it('compares identity names ignoring case and spacing', () => {
		expect(namesMatch('ADA OBI', 'Ada Obi')).toBe(true);
		expect(namesMatch('ADA  OBI', 'ada obi')).toBe(true);
		expect(namesMatch('STARLIGHT EXPERIENCES LTD', 'Ada Obi')).toBe(false);
		expect(namesMatch('', 'Ada Obi')).toBe(false);
	});
});

describe('payout account verification in settings', () => {
	/** Stand-in for `POST /api/payout/resolve`: the same directory the server uses. */
	const stubResolveEndpoint = () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) !== '/api/payout/resolve') return new Response('{}', { status: 200 });
				const body = JSON.parse(String(init?.body ?? '{}')) as { bank: string; accountNumber: string };
				const accountName = resolveAccountName(body.bank, body.accountNumber);
				return new Response(
					JSON.stringify(
						accountName ? { ok: true, accountName, simulated: true } : { error: 'That account could not be resolved.' }
					),
					{ status: accountName ? 200 : 404, headers: { 'content-type': 'application/json' } }
				);
			})
		);
	};

	/** Let the enquiry timer fire and its fetch promise chain settle. */
	const finishLookup = async () => {
		await vi.advanceTimersByTimeAsync(PAYOUT_LOOKUP_MS + 10);
		for (let i = 0; i < 6; i += 1) await Promise.resolve();
		await tick();
	};

	beforeEach(() => {
		vi.useFakeTimers();
		stubResolveEndpoint();
		setSession({ userId: 'u-ada', name: 'Ada Obi', role: 'attendee' });
		appSettings.value.verification.payoutAccount = false;
		appSettings.value.payout = { ...EMPTY_PAYOUT };
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
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

		await finishLookup();

		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();
		expect(save).not.toBeDisabled();
		expect(save).toHaveTextContent('Verify & save payout account');
		// Nothing is stored until the user confirms.
		expect(appSettings.value.payout).toEqual(EMPTY_PAYOUT);
		expect(appSettings.value.verification.payoutAccount).toBe(false);
	});

	it('resolves the name of the account that was entered, not the signed-in user', async () => {
		// The signed-in profile is Ada Obi, but 9876543210 belongs to Amina Bello.
		await fillPayout('9876543210');
		await finishLookup();

		expect(screen.getByText(/Account name: AMINA BELLO/)).toBeInTheDocument();
		expect(screen.queryByText(/Account name: ADA OBI/)).not.toBeInTheDocument();
		// A payout account registered to somebody else cannot be called "ready".
		expect(screen.getByText(/not to your verified identity \(Ada Obi\)/)).toBeInTheDocument();
		expect(screen.queryByText(/Matches your verified identity/)).not.toBeInTheDocument();
	});

	it('greets the account holder when the name matches the verified identity', async () => {
		await fillPayout('0123456789');
		await finishLookup();

		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();
		expect(screen.getByText(/Matches your verified identity — ready for payouts/)).toBeInTheDocument();
		expect(screen.queryByText(/may be rejected/)).not.toBeInTheDocument();
	});

	it('changes the resolved name when the account number changes', async () => {
		const input = await fillPayout('0123456789');
		await finishLookup();
		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();

		await fireEvent.input(input, { target: { value: '4455667788' } });
		await finishLookup();

		expect(screen.queryByText(/Account name: ADA OBI/)).not.toBeInTheDocument();
		expect(screen.getByText(/Account name: CHIAMAKA OKAFOR/)).toBeInTheDocument();
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
		await finishLookup();
		expect(screen.getByText(/Account name: ADA OBI/)).toBeInTheDocument();

		await fireEvent.input(input, { target: { value: '0123456788' } });

		expect(screen.queryByText(/Account name: ADA OBI/)).not.toBeInTheDocument();
		expect(screen.getByText(/Resolving account name/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Verify and save payout account' })).toBeDisabled();
	});

	it('saves the verified account and shows it on the verification card', async () => {
		await fillPayout();
		await finishLookup();
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

/**
 * Payout account helpers shared by Settings and every settlement surface
 * (organizer dashboard, event wizard, issuance & settlement).
 *
 * There is no live NIBSS/Paystack integration in this app yet, so the name
 * enquiry is simulated. Keeping it behind this module means swapping in a real
 * provider only touches `lookupAccountName` — no component changes.
 */

export interface PayoutAccount {
	bank: string;
	accountNumber: string;
	accountName: string;
}

/** Nigeria's major commercial banks/MFBs, as offered in the payout sheet. */
export const PAYOUT_BANKS = [
	'GTBank',
	'Access Bank',
	'Zenith Bank',
	'First Bank',
	'UBA',
	'Kuda',
	'Moniepoint',
	'OPay',
	'PalmPay',
	'Fidelity Bank',
	'Union Bank',
	'Sterling Bank'
] as const;

/** NUBAN accounts are exactly ten digits. */
export const NUBAN_LENGTH = 10;

/** Debounce before the name enquiry fires, so editing digits does not spam the endpoint. */
export const PAYOUT_LOOKUP_MS = 300;

/** How long saving the verified account takes (simulated gateway round-trip). */
export const PAYOUT_SAVE_MS = 500;

/** Strip everything but digits and cap at ten, so pasted numbers are accepted. */
export function normaliseNuban(raw: string): string {
	return raw.replace(/\D/g, '').slice(0, NUBAN_LENGTH);
}

export function isValidNuban(raw: string): boolean {
	return new RegExp(`^\\d{${NUBAN_LENGTH}}$`).test(raw.trim());
}

/** Only the last four digits are ever shown: "••••4821". */
export function maskAccountNumber(raw: string): string {
	const digits = normaliseNuban(raw);
	return digits.length >= 4 ? `••••${digits.slice(-4)}` : '••••';
}

/** One-line settlement label: "GTBank ••••4821", or a prompt when unlinked. */
export function payoutAccountLabel(payout: PayoutAccount | null | undefined): string {
	if (!payout?.bank) return 'No payout account linked';
	return payout.accountNumber ? `${payout.bank} ${maskAccountNumber(payout.accountNumber)}` : payout.bank;
}

const BANK_MARKS: Record<string, string> = {
	GTBank: 'GTB',
	'Access Bank': 'ACC',
	'Zenith Bank': 'ZEN',
	'First Bank': 'FBN',
	UBA: 'UBA',
	Kuda: 'KUD',
	Moniepoint: 'MON',
	OPay: 'OPY',
	PalmPay: 'PMP',
	'Fidelity Bank': 'FID',
	'Union Bank': 'UBN',
	'Sterling Bank': 'STL'
};

/** Three-letter chip used in compact cards ("GTB", "ACC", "ZEN"). */
export function payoutBankMark(bank: string): string {
	if (!bank) return '—';
	return BANK_MARKS[bank] ?? bank.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
}

/**
 * Simulated NIBSS name enquiry.
 *
 * A real enquiry answers for the *account*, not for whoever is signed in:
 * different account numbers resolve to different people, and the same number
 * always resolves to the same name. This demo directory reproduces that, so
 * the sheet can never show one person's name for somebody else's account.
 *
 * Wiring a real provider means replacing `resolveAccountName` (server-side,
 * where the secret key lives); nothing else in the app has to change.
 */

/**
 * Documented demo accounts, matched on the NUBAN across banks. `0123456789`
 * is the placeholder used in the form and resolves to the demo identity so a
 * reviewer can complete the flow with the account that matches their KYC name.
 */
export const DEMO_ACCOUNT_DIRECTORY: Record<string, string> = {
	'0123456789': 'ADA OBI',
	'9876543210': 'AMINA BELLO',
	'2030405060': 'TUNDE BAKARE',
	'4455667788': 'CHIAMAKA OKAFOR',
	'5566778899': 'FEMI ADEYEMI',
	'6677889900': 'STARLIGHT EXPERIENCES LTD'
};

const FIRST_NAMES = [
	'CHINEDU',
	'AMAKA',
	'IBRAHIM',
	'FUNMILAYO',
	'EMEKA',
	'AISHA',
	'SEGUN',
	'NGOZI',
	'YUSUF',
	'BLESSING',
	'OLUWASEUN',
	'HALIMA',
	'DAVID',
	'GRACE',
	'KELECHI',
	'ZAINAB'
];

const LAST_NAMES = [
	'OKAFOR',
	'ADEYEMI',
	'BELLO',
	'EZE',
	'MUSA',
	'ALAKIJA',
	'OKONKWO',
	'BALOGUN',
	'NWOSU',
	'SANI',
	'ADEBISI',
	'OBI',
	'ADEYINKA',
	'EKWUEME',
	'IBRAHIM',
	'OLADELE'
];

const BUSINESS_NAMES = [
	'GREENFIELD TRADING LTD',
	'NORTHGATE VENTURES LTD',
	'BLUEBIRD MEDIA LTD',
	'LAGOS CREATIVE COLLECTIVE LTD',
	'HARBOUR LOGISTICS LTD'
];

/** FNV-1a: small, stable and dependency-free — the same input always hashes the same. */
function hash(input: string): number {
	let value = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		value ^= input.charCodeAt(i);
		value = Math.imul(value, 0x01000193);
	}
	return value >>> 0;
}

/**
 * Resolve the account holder for a bank + NUBAN.
 *
 * Deterministic: the result depends on the account, never on who is signed in.
 * A given number at two different banks is two different accounts, so the bank
 * is part of the key for numbers outside the documented directory.
 */
export function resolveAccountName(bank: string, accountNumber: string): string | null {
	if (!bank || !isValidNuban(accountNumber)) return null;
	const nuban = normaliseNuban(accountNumber);
	const known = DEMO_ACCOUNT_DIRECTORY[nuban];
	if (known) return known;

	const seed = hash(`${bank}|${nuban}`);
	// Roughly one in six settlement accounts belongs to a registered business.
	if (seed % 6 === 0) return BUSINESS_NAMES[seed % BUSINESS_NAMES.length];
	const first = FIRST_NAMES[seed % FIRST_NAMES.length];
	const last = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length];
	return `${first} ${last}`;
}

/** Compare names ignoring case, spacing and punctuation ("Ada  Obi" vs "ADA OBI"). */
export function namesMatch(a: string, b: string): boolean {
	const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	if (!normalise(a) || !normalise(b)) return false;
	return normalise(a) === normalise(b);
}

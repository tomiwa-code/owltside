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

/** How long the demo name enquiry takes, so the UI can show its progress state. */
export const PAYOUT_LOOKUP_MS = 650;

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
 * The demo account holder is the signed-in person, so a valid bank + NUBAN
 * resolves to their registered name — exactly what a real lookup of their own
 * account returns. A real integration replaces this with the provider call.
 */
export function lookupAccountName(bank: string, accountNumber: string, holderName: string): string | null {
	if (!bank || !isValidNuban(accountNumber)) return null;
	const name = holderName.trim();
	if (!name) return null;
	return name.replace(/\s+/g, ' ').toUpperCase();
}

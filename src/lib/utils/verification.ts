import type { ApprovalRequest } from '$lib/types';

export const VERIFICATION_CHECKS = ['phone', 'identity', 'payoutAccount'] as const;
export type VerificationCheck = (typeof VERIFICATION_CHECKS)[number];

/** The latest record wins, including an admin's request for new details. */
export function latestVerificationRequest(
	approvals: ApprovalRequest[],
	check: string
): ApprovalRequest | null {
	return approvals.reduce<ApprovalRequest | null>((latest, request) => {
		if (request.kind !== 'verification' || request.payload?.check !== check) return latest;
		return !latest || Date.parse(request.createdAt) > Date.parse(latest.createdAt) ? request : latest;
	}, null);
}

/** Device preferences and historical approvals are never verification authority. */
export function verificationChecks(approvals: ApprovalRequest[]) {
	return {
		phone: latestVerificationRequest(approvals, 'phone')?.status === 'approved',
		identity: latestVerificationRequest(approvals, 'identity')?.status === 'approved',
		payoutAccount: latestVerificationRequest(approvals, 'payoutAccount')?.status === 'approved'
	};
}

/** Only the currently approved bank details may be used as a payout destination. */
export function approvedPayoutAccount(approvals: ApprovalRequest[]): { bank: string; accountNumber: string } | null {
	const request = latestVerificationRequest(approvals, 'payoutAccount');
	if (request?.status !== 'approved') return null;
	const { bank, accountNumber } = request.payload ?? {};
	return typeof bank === 'string' && bank && typeof accountNumber === 'string' && /^\d{10}$/.test(accountNumber)
		? { bank, accountNumber }
		: null;
}

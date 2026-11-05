import type { ApprovalRequest, ApprovalStatus } from '$lib/types';
import type { VerificationCheck } from '$lib/utils/verification';

export function verificationApproval(
	check: VerificationCheck,
	status: ApprovalStatus = 'approved',
	overrides: Partial<ApprovalRequest> = {}
): ApprovalRequest {
	return {
		id: `ap-${check}-${status}`,
		requesterId: 'u-ada',
		kind: 'verification',
		status,
		title: `${check} verification`,
		summary: 'Submitted for admin review',
		createdAt: '2026-10-01T10:00:00.000Z',
		payload: {
			check,
			...(check === 'phone' ? { phone: '+2348031234567' } : {}),
			...(check === 'identity' ? { document: 'NIN', reference: '6789' } : {}),
			...(check === 'payoutAccount' ? { bank: 'GTBank', accountNumber: '0123456789' } : {})
		},
		...overrides
	};
}

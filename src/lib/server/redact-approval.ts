import type { ApprovalRequest } from '$lib/types';

/**
 * Redact raw KYC media and full government ID numbers from public browser responses
 * while keeping the unredacted payload intact inside `approval_requests` for Admin.
 */
export function redactForPublicClient(approval: ApprovalRequest): ApprovalRequest {
	const rawPayload = (approval.payload ?? {}) as Record<string, unknown>;
	const sanitized: Record<string, unknown> = { ...rawPayload };
	delete sanitized.fullReference;
	if (sanitized.frontDocument && typeof sanitized.frontDocument === 'object') {
		const doc = sanitized.frontDocument as { name?: string; mimeType?: string };
		sanitized.frontDocument = { name: doc.name ?? 'front', uploaded: true };
	}
	if (sanitized.backDocument && typeof sanitized.backDocument === 'object') {
		const doc = sanitized.backDocument as { name?: string; mimeType?: string };
		sanitized.backDocument = { name: doc.name ?? 'back', uploaded: true };
	}
	return { ...approval, payload: sanitized };
}

export type Tone = 'ok' | 'warn' | 'danger' | 'accent' | 'info' | 'neutral';

export interface StatusMeta {
	label: string;
	tone: Tone;
}

const CHIP: Record<Tone, string> = {
	ok: 'chip chip-ok',
	warn: 'chip chip-warn',
	danger: 'chip chip-danger',
	accent: 'chip chip-accent',
	info: 'chip chip-info',
	neutral: 'chip'
};

export function chipClass(tone: Tone): string {
	return CHIP[tone];
}

export function eventStatus(status: string): StatusMeta {
	switch (status) {
		case 'published':
			return { label: 'Published', tone: 'ok' };
		case 'pending':
			return { label: 'Pending review', tone: 'warn' };
		case 'draft':
			return { label: 'Draft', tone: 'neutral' };
		case 'suspended':
			return { label: 'Suspended', tone: 'danger' };
		case 'completed':
			return { label: 'Completed', tone: 'info' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function organizerStatus(status: string): StatusMeta {
	switch (status) {
		case 'verified':
			return { label: 'Verified', tone: 'ok' };
		case 'pending':
			return { label: 'Pending KYB', tone: 'warn' };
		case 'flagged':
			return { label: 'Flagged', tone: 'danger' };
		case 'suspended':
			return { label: 'Suspended', tone: 'danger' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function ticketStatus(status: string): StatusMeta {
	switch (status) {
		case 'valid':
			return { label: 'Valid · unused', tone: 'accent' };
		case 'void':
			return { label: 'Void', tone: 'danger' };
		case 'refunded':
			return { label: 'Refunded', tone: 'warn' };
		case 'transferred':
			return { label: 'Transferred', tone: 'info' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function orderStatus(status: string): StatusMeta {
	switch (status) {
		case 'settled':
			return { label: 'Settled', tone: 'ok' };
		case 'pending':
			return { label: 'Pending', tone: 'warn' };
		case 'failed':
			return { label: 'Failed', tone: 'danger' };
		case 'refunded':
			return { label: 'Refunded', tone: 'warn' };
		case 'disputed':
			return { label: 'Disputed', tone: 'danger' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function refundStatus(status: string): StatusMeta {
	switch (status) {
		case 'pending':
			return { label: 'Pending review', tone: 'warn' };
		case 'approved':
			return { label: 'Approved', tone: 'accent' };
		case 'processing':
			return { label: 'Settling', tone: 'info' };
		case 'settled':
			return { label: 'Refunded', tone: 'ok' };
		case 'rejected':
			return { label: 'Rejected', tone: 'danger' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function caseStatus(status: string): StatusMeta {
	switch (status) {
		case 'open':
			return { label: 'Open', tone: 'warn' };
		case 'escalated':
			return { label: 'Escalated · Tier 2', tone: 'danger' };
		case 'quarantined':
			return { label: 'Quarantined', tone: 'danger' };
		case 'reviewing':
			return { label: 'Under review', tone: 'info' };
		case 'resolved':
			return { label: 'Resolved', tone: 'ok' };
		case 'dismissed':
			return { label: 'Dismissed', tone: 'neutral' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function severityMeta(severity: string): StatusMeta {
	switch (severity) {
		case 'critical':
			return { label: 'Critical', tone: 'danger' };
		case 'high':
			return { label: 'High', tone: 'warn' };
		case 'medium':
			return { label: 'Medium', tone: 'info' };
		case 'low':
			return { label: 'Low', tone: 'neutral' };
		default:
			return { label: severity, tone: 'neutral' };
	}
}

export function userStatus(status: string): StatusMeta {
	switch (status) {
		case 'active':
			return { label: 'Active', tone: 'ok' };
		case 'flagged':
			return { label: 'Flagged', tone: 'warn' };
		case 'blocked':
			return { label: 'Blocked', tone: 'danger' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

export function settlementState(state: string): StatusMeta {
	switch (state) {
		case 'settled':
			return { label: 'Settled · payout ready', tone: 'ok' };
		case 'queued':
			return { label: 'Queued', tone: 'info' };
		case 'next_batch':
			return { label: 'Next batch', tone: 'accent' };
		case 'frozen':
			return { label: 'Escrow frozen', tone: 'danger' };
		default:
			return { label: state, tone: 'neutral' };
	}
}

export function staffStatus(status: string): StatusMeta {
	switch (status) {
		case 'active':
			return { label: 'Active', tone: 'ok' };
		case 'invited':
			return { label: 'Invited', tone: 'warn' };
		case 'suspended':
			return { label: 'Suspended', tone: 'danger' };
		default:
			return { label: status, tone: 'neutral' };
	}
}

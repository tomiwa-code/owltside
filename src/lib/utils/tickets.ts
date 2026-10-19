import type { Ticket } from '$lib/types';

const STATUS_LABELS: Record<Ticket['status'], string> = {
	valid: 'Valid',
	// A checked-in ticket is stored as `used`; holders see the clearer
	// gate outcome, "Verified".
	used: 'Verified',
	refunded: 'Refunded',
	transferred: 'Transferred'
};

export function ticketStatusLabel(status: Ticket['status']): string {
	return STATUS_LABELS[status];
}

export function ticketStatusChip(status: Ticket['status']): string {
	return `Pass_${ticketStatusLabel(status)}`;
}

export function isVerifiedTicket(ticket: Pick<Ticket, 'status'>): boolean {
	return ticket.status === 'used';
}

/** Transfer, wallet export, and refund actions are only usable before check-in. */
export function canUseTicketActions(ticket: Pick<Ticket, 'status'>): boolean {
	return ticket.status === 'valid';
}

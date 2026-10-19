import { describe, expect, it } from 'vitest';
import {
	canUseTicketActions,
	isVerifiedTicket,
	ticketStatusChip,
	ticketStatusLabel
} from './tickets';

describe('ticket status presentation', () => {
	it('shows a checked-in ticket to its holder as Verified', () => {
		expect(ticketStatusLabel('used')).toBe('Verified');
		expect(ticketStatusChip('used')).toBe('Pass_Verified');
		expect(isVerifiedTicket({ status: 'used' })).toBe(true);
	});

	it('only allows transfer, wallet, and refund actions before verification', () => {
		expect(canUseTicketActions({ status: 'valid' })).toBe(true);
		for (const status of ['used', 'refunded', 'transferred'] as const) {
			expect(canUseTicketActions({ status })).toBe(false);
		}
	});
});

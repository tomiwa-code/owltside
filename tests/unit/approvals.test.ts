import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideDemoApproval, demoSource } from '$lib/server/datasource';
import * as demo from '$lib/server/demo/seed';
import { POST as submitApproval, GET as listMine } from '../../src/routes/api/approvals/+server';

/**
 * Everything that needs an administrator decision must reach the admin console
 * as `pending` — the public app is never allowed to approve itself.
 */

const jsonRequest = (body: unknown) =>
	new Request('http://localhost/api/approvals', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

const context = (request?: Request) =>
	({
		request,
		locals: { session: null, demoMode: true },
		cookies: { getAll: () => [], get: () => undefined, set: vi.fn(), delete: vi.fn() }
	}) as never;

describe('approval requests (demo datasource)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('files a ticket refund as pending and leaves the pass usable', async () => {
		const ticket = demo.tickets.find((item) => item.code.startsWith('EV-')) ?? demo.tickets[0];
		const approval = await demoSource.requestTicketRefund('demo', ticket.id, {
			reason: 'Schedule Conflict',
			details: 'Clashes with a work trip.'
		});

		expect(approval.kind).toBe('refund');
		expect(approval.status).toBe('pending');
		expect(approval.subjectId).toBe(ticket.id);
		expect(approval.amount).toBe(ticket.price);
		// The pass stays valid until an admin approves the refund.
		const tickets = await demoSource.getTickets('demo');
		expect(tickets.find((item) => item.id === ticket.id)?.status).toBe('valid');
	});

	it('refuses a second open request for the same pass', async () => {
		const ticket = demo.tickets[demo.tickets.length - 1];
		await demoSource.requestTicketRefund('demo', ticket.id, { reason: 'Emergency' });
		await expect(
			demoSource.requestTicketRefund('demo', ticket.id, { reason: 'Emergency' })
		).rejects.toThrow(/already awaiting approval/i);
	});

	it('lists only the caller’s own requests, newest first', async () => {
		const mine = await demoSource.listApprovals('demo');
		expect(mine.length).toBeGreaterThan(0);
		expect(mine.every((request) => request.requesterId === 'u-ada')).toBe(true);
		expect(mine.some((request) => request.kind === 'payout' && request.status === 'pending')).toBe(true);
		const stamps = mine.map((request) => +new Date(request.createdAt));
		expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
	});
});

describe('POST /api/approvals', () => {
	it('accepts an identity submission as a pending review request', async () => {
		const response = await submitApproval(
			context(
				jsonRequest({
					kind: 'verification',
					check: 'identity',
					details: { document: 'NIN', reference: '123456784421' }
				})
			)
		);
		expect(response.status).toBe(201);
		const body = (await response.json()) as {
			kind: string;
			status: string;
			summary: string;
			payload: { reference: string };
		};
		expect(body.kind).toBe('verification');
		expect(body.status).toBe('pending');
		// Only the last four digits are kept, in the summary and in the payload.
		expect(body.summary).toContain('4421');
		expect(body.summary).not.toContain('123456784421');
		expect(body.payload.reference).toBe('4421');
	});

	it('masks the payout account number in the review summary', async () => {
		const response = await submitApproval(
			context(
				jsonRequest({
					kind: 'verification',
					check: 'payoutAccount',
					details: { bank: 'GTBank', accountNumber: '0123456789' }
				})
			)
		);
		expect(response.status).toBe(201);
		const body = (await response.json()) as { summary: string };
		expect(body.summary).toBe('GTBank ••••6789 submitted for review');
	});

	it('rejects an incomplete payout account', async () => {
		const response = await submitApproval(
			context(
				jsonRequest({
					kind: 'verification',
					check: 'payoutAccount',
					details: { bank: 'GTBank', accountNumber: '012345678' }
				})
			)
		);
		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toMatch(/10-digit/i);
	});

	it('accepts a payout request only after the event closes, blocks active events, and blocks re-requests once approved', async () => {
		const activeRes = await submitApproval(
			context(
				jsonRequest({
					kind: 'payout',
					amount: 1_240_000,
					subjectId: demo.rooftopEvent.id,
					subjectLabel: demo.rooftopEvent.title,
					destination: 'GTBank ••••6789'
				})
			)
		);
		expect(activeRes.status).toBe(400);
		expect(((await activeRes.json()) as { error: string }).error).toMatch(/after the event closes/i);

		const ok = await submitApproval(
			context(
				jsonRequest({
					kind: 'payout',
					amount: 308_000,
					subjectId: demo.pastSessionEvent.id,
					subjectLabel: demo.pastSessionEvent.title,
					destination: 'GTBank ••••6789'
				})
			)
		);
		expect(ok.status).toBe(201);
		const created = (await ok.json()) as { id: string; kind: string; title: string; amount: number };
		expect(created.kind).toBe('payout');
		expect(created.title).toBe(`Payout request · ${demo.pastSessionEvent.title}`);
		expect(created.amount).toBe(308_000);

		// Once approved by admin, payout cannot be requested again for this event.
		decideDemoApproval(created.id, 'approved', 'Settled to GTBank');
		const repeatAfterApproval = await submitApproval(
			context(
				jsonRequest({
					kind: 'payout',
					amount: 308_000,
					subjectId: demo.pastSessionEvent.id,
					subjectLabel: demo.pastSessionEvent.title,
					destination: 'GTBank ••••6789'
				})
			)
		);
		expect(repeatAfterApproval.status).toBe(400);
		expect(((await repeatAfterApproval.json()) as { error: string }).error).toMatch(/already been approved/i);

		const empty = await submitApproval(
			context(jsonRequest({ kind: 'payout', subjectId: demo.pastSessionEvent.id, amount: 0 }))
		);
		expect(empty.status).toBe(400);
	});

	it('never lets the client submit its own refund or decision type', async () => {
		const response = await submitApproval(context(jsonRequest({ kind: 'refund', subjectId: 't-1' })));
		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toMatch(/cannot be submitted/i);
	});

	it('returns the caller’s pending requests to the public app', async () => {
		const response = await listMine(context());
		expect(response.status).toBe(200);
		const rows = (await response.json()) as { kind: string; status: string }[];
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.some((row) => row.status === 'pending')).toBe(true);
	});
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
	approvalMode,
	decideApproval,
	listApprovals,
	pendingApprovalCount
} from '$admin/server/approvals';
import { getApprovalsData, getTicket, resetDemoStore } from '$admin/server/store';

/**
 * The console is the only place a refund, payout or verification can be
 * approved — the public app writes `pending` rows and waits.
 */
describe('approval queue', () => {
	beforeEach(() => {
		resetDemoStore();
		delete process.env.SUPABASE_URL;
		delete process.env.PUBLIC_SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	it('falls back to the demo dataset without Supabase credentials', () => {
		expect(approvalMode()).toBe('demo');
	});

	it('lists every request kind with a reviewable dossier', async () => {
		const { rows, mode } = await listApprovals();
		expect(mode).toBe('demo');
		expect(rows.length).toBeGreaterThan(0);
		expect(new Set(rows.map((row) => row.kind))).toEqual(
			new Set(['refund', 'payout', 'verification'])
		);
		for (const row of rows) {
			expect(row.title.length).toBeGreaterThan(0);
			expect(row.requesterName.length).toBeGreaterThan(0);
			expect(row.details.length).toBeGreaterThan(0);
		}
	});

	it('counts only pending requests for the sidebar badge', () => {
		const pending = getApprovalsData().rows.filter((row) => row.status === 'pending').length;
		expect(pendingApprovalCount()).toBe(pending);
		expect(pending).toBeGreaterThan(0);
	});

	it('approving a refund settles the pass and clears it from the queue', async () => {
		const refund = getApprovalsData().rows.find(
			(row) => row.kind === 'refund' && row.status === 'pending'
		);
		expect(refund).toBeTruthy();
		const ticketBefore = refund!.subjectId ? getTicket(refund!.subjectId) : null;

		const result = await decideApproval(refund!.id, 'approve', 'Test admin', 'Inside the window.');

		expect(result).toEqual({ id: refund!.id, status: 'approved' });
		const after = getApprovalsData().rows.find((row) => row.id === refund!.id);
		expect(after?.status).toBe('approved');
		expect(after?.decidedBy).toBe('Test admin');
		if (ticketBefore) expect(getTicket(ticketBefore.id)?.status).toBe('refunded');
	});

	it('rejecting requires a reason and keeps it for the requester', async () => {
		const payout = getApprovalsData().rows.find(
			(row) => row.kind === 'payout' && row.status === 'pending'
		);
		expect(payout).toBeTruthy();

		await expect(decideApproval(payout!.id, 'reject', 'Test admin', '  ')).rejects.toThrow(
			/reason/i
		);

		const result = await decideApproval(
			payout!.id,
			'reject',
			'Test admin',
			'Account name did not match.'
		);
		expect(result.status).toBe('rejected');
		const after = getApprovalsData().rows.find((row) => row.id === payout!.id);
		expect(after?.note).toBe('Account name did not match.');
	});

	it('cannot decide the same request twice', async () => {
		const verification = getApprovalsData().rows.find(
			(row) => row.kind === 'verification' && row.status === 'pending'
		);
		expect(verification).toBeTruthy();
		await decideApproval(verification!.id, 'approve', 'Test admin', 'Matched.');
		await expect(decideApproval(verification!.id, 'approve', 'Test admin', '')).rejects.toThrow(
			/no longer in the queue/i
		);
	});
});

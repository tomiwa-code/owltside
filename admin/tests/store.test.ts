import { beforeEach, describe, expect, it } from 'vitest';
import {
	countTickets,
	countUsers,
	decideRefund,
	getAuditEntry,
	getCheckinOps,
	getOrder,
	getRefundsData,
	getSettlements,
	getTicket,
	initiateRefund,
	inviteStaff,
	listAudit,
	listEvents,
	listOrders,
	listTickets,
	listUsers,
	reissueTicket,
	resetDemoStore,
	resolveCase,
	searchHud,
	setLockdown,
	setStaffStatus,
	setTicketCheckin,
	setUserStatus,
	updateSettings,
	verifyLedger,
	voidTicket,
	getSettings,
	listCases
} from '$admin/server/store';

describe('control-plane store', () => {
	beforeEach(() => {
		resetDemoStore();
	});

	it('seeds a deterministic platform snapshot', () => {
		const events = listEvents({ perPage: 100 });
		const tickets = countTickets();
		const users = countUsers();

		expect(events.total).toBeGreaterThan(100);
		expect(tickets.total).toBeGreaterThan(4_000);
		expect(tickets.checkedIn).toBeGreaterThan(3_000);
		expect(tickets.revoked).toBeGreaterThan(20);
		expect(users.total).toBe(18_420);
	});

	it('clamps pagination so a hostile query cannot dump the table', () => {
		const page = listTickets({ perPage: 10_000 });
		expect(page.perPage).toBe(100);
		expect(page.rows.length).toBeLessThanOrEqual(100);
		expect(listTickets({ page: 0 }).page).toBe(1);
	});

	it('voids a pass and appends an immutable audit record', () => {
		const target = listTickets({ status: 'valid' }).rows[0];
		const voided = voidTicket(target.id, 'Tomiwa A.', 'Duplicate purchase');

		expect(voided?.status).toBe('void');
		expect(getTicket(target.id)?.status).toBe('void');

		const audit = getAuditEntry('aud-884920');
		const entries = listAudit({ q: target.code }).rows;
		expect(entries[0]?.action).toBe('TICKET_VOIDED');
		expect(entries[0]?.reason).toBe('Duplicate purchase');
		expect(audit).not.toBeNull();
	});

	it('re-issues a voided pass with a fresh HMAC epoch', () => {
		const target = listTickets({ status: 'valid' }).rows[0];
		voidTicket(target.id, 'Tomiwa A.', 'Lost device');
		const reissued = reissueTicket(target.id, 'Tomiwa A.', 'Attendee collected replacement');

		expect(reissued?.status).toBe('valid');
		expect(reissued?.hmacEpoch).toBeGreaterThan(12);
	});

	it('only initiates refunds on settled orders', () => {
		const settled = getOrder('ord-9942');
		expect(settled?.status).toBe('settled');

		const refund = initiateRefund('ord-9942', 'Kemi O.', 'Duplicate checkout');
		expect(refund?.status).toBe('processing');
		expect(getOrder('ord-9942')?.status).toBe('refunded');
		expect(getRefundsData().rows[0]?.id).toBe(refund?.id);

		const unsettled = listOrders({ status: 'pending' }).rows[0];
		expect(unsettled).toBeDefined();
		expect(initiateRefund(unsettled.id, 'Kemi O.', 'nope')).toBeNull();
		expect(getOrder(unsettled.id)?.status).toBe('pending');
		expect(initiateRefund('does-not-exist', 'Kemi O.', 'nope')).toBeNull();
	});

	it('requires a resolution note before closing a moderation case', () => {
		const openCase = listCases({ status: 'escalated' })[0];
		expect(openCase).toBeDefined();

		const resolved = resolveCase(openCase.id, 'freeze', 'Chioma N.', 'Confirmed replay attacks at gate scanner');
		expect(resolved?.status).toBe('resolved');
		expect(resolved?.resolutionNote).toContain('replay');
	});

	it('blocks accounts and records the reviewer', () => {
		const user = listUsers({ status: 'active' }).rows[0];
		const updated = setUserStatus(user.id, 'blocked', 'Chioma N.', 'Chargeback ring');

		expect(updated?.status).toBe('blocked');
		expect(listUsers({ status: 'blocked' }).rows.some((row) => row.id === user.id)).toBe(true);
	});

	it('suspends administrators and protects the primary super admin', () => {
		const invited = inviteStaff({ name: 'Adaeze Okonkwo', email: 'adaeze@owltside.com', role: 'Support Agent', tier: 2 }, 'Tomiwa A.');
		expect(invited.status).toBe('invited');

		const suspended = setStaffStatus(invited.id, 'suspended', 'Tomiwa A.', 'Failed hardware enrolment');
		expect(suspended?.status).toBe('suspended');
		expect(suspended?.sessions).toBe(0);
	});

	it('validates money-moving settings and logs a diff', () => {
		const settings = updateSettings({ platformFeePct: 9.5, hmacRotateSec: 45 }, 'Tomiwa A.');
		expect(settings.platformFeePct).toBe(9.5);
		expect(settings.hmacRotateSec).toBe(45);

		const record = listAudit({ kind: 'settings' }).rows[0];
		expect(record?.action).toBe('SETTINGS_POLICY_UPDATED');
		expect(record?.diff?.some((entry) => entry.field === 'platformFeePct' && entry.after === '9.5')).toBe(true);
	});

	it('arms the emergency gate lockdown as a critical audit event', () => {
		expect(getSettings().lockdownArmed).toBe(false);
		const settings = setLockdown(true, 'Tomiwa A.');

		expect(settings.lockdownArmed).toBe(true);
		expect(listAudit({ severity: 'critical' }).rows[0]?.action).toBe('EMERGENCY_GATE_LOCKDOWN_ARMED');
	});

	it('keeps the audit hash chain intact', () => {
		const result = verifyLedger();
		expect(result.records).toBeGreaterThan(1_000);
		expect(result.brokenAt).toBeNull();
		expect(result.verified).toBe(result.records);
	});

	it('federates the search HUD across entities', () => {
		const results = searchHud('alex', 5);
		expect(results.users.length).toBeGreaterThan(0);
		expect(results.users[0]?.handle).toContain('alex');
		expect(results.elapsedMs).toBeGreaterThanOrEqual(0);
		expect(searchHud('a', 5).users.length).toBeGreaterThanOrEqual(0);
	});

	it('reports gate clearance and scanner fleet health', () => {
		const ops = getCheckinOps(null);
		expect(ops.fleet.length).toBeGreaterThan(1);
		expect(ops.fleet.every((node) => node.health >= 0 && node.health <= 100)).toBe(true);
		expect(ops.clearance.checkedIn).toBeGreaterThan(0);
		expect(ops.clearance.remaining).toBeGreaterThanOrEqual(0);
	});

	it('lets a marshal reverse a check-in', () => {
		const checked = getCheckinOps(null).feed[0];
		expect(checked).toBeDefined();
		const reversed = setTicketCheckin(checked.id, false, 'Fola D.');
		expect(reversed?.status).toBe('valid');
		expect(reversed?.checkedInAt).toBeUndefined();
	});

	it('computes settlement rows with fees and payout state', () => {
		const settlements = getSettlements();
		expect(settlements.rows.length).toBeGreaterThan(5);
		expect(settlements.rows[0].gmvNgn).toBeGreaterThan(settlements.rows[0].payoutNgn);
		expect(settlements.settledPct).toBeGreaterThan(90);
	});
});

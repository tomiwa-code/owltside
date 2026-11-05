import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authEmailVerification, userApprovalSnapshots } from '../src/lib/server/supabase-data';
import { auditFor } from '../src/lib/server/store';
import { requestUserReverification } from '../src/lib/server/verification';
import { POST } from '../src/routes/api/users/[id]/reverify/+server';
import type { AdminSession } from '../src/lib/types';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/server/supabase-data', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/lib/server/supabase-data')>();
	return { ...original, createAdminClient: () => ({ rpc }) };
});

const userId = '11111111-2222-4333-8444-555555555555';
const admin = { name: 'Review Admin', tier: 1 } as AdminSession;
const context = (body: unknown, session: AdminSession | null = admin, id = userId) => ({
	params: { id }, locals: { admin: session },
	request: new Request(`http://admin.test/api/users/${id}/reverify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}) as never;

beforeEach(() => { rpc.mockReset(); });

describe('email verification in admin profiles', () => {
	it('uses the confirmed email from registration, independent of KYC', () => {
		expect(authEmailVerification({ email: 'member@example.com', email_confirmed_at: '2026-11-01T10:00:00Z' })).toEqual({ emailVerified: true, emailVerifiedAt: '2026-11-01T10:00:00Z' });
	});
	it('does not accept user-editable metadata or phone confirmation as email verification', () => {
		for (const auth of [undefined, {}, { email: 'member@example.com' }, { email: 'member@example.com', user_metadata: { email_verified: true }, confirmed_at: '2026-11-01T10:00:00Z', phone_confirmed_at: '2026-11-01T10:00:00Z' }]) {
			expect(authEmailVerification(auth).emailVerified).toBe(false);
		}
	});
});

describe('latest admin profile review states', () => {
	it('retains the previous identity and bank details without restoring their old approved status', () => {
		const rows = [
			{ requester_id: userId, kind: 'verification', status: 'reverification_required', payload: { check: 'identity' } },
			{ requester_id: userId, kind: 'verification', status: 'reverification_required', payload: { check: 'payoutAccount' } },
			{ requester_id: userId, kind: 'verification', status: 'pending', payload: { check: 'phone', phone: '+2348031234567' } },
			{ requester_id: userId, kind: 'verification', status: 'approved', payload: { check: 'identity', document: 'NIN', fullReference: '12345678901', frontDocument: { name: 'id.jpg', dataUrl: 'data:image/jpeg;base64,eA==' } } },
			{ requester_id: userId, kind: 'verification', status: 'approved', payload: { check: 'payoutAccount', bank: 'GTBank', accountNumber: '0123456789' } }
		];
		const result = userApprovalSnapshots(rows).get(userId);
		expect(result).toMatchObject({ kycStatus: 'reverification_required', kycReference: '12345678901', bankStatus: 'reverification_required', accountNumber: '0123456789', phoneStatus: 'pending', phone: '+2348031234567' });
		expect(result?.kycAttachments?.[0].dataUrl).toBe('data:image/jpeg;base64,eA==');
	});
});

describe('admin-only re-verification endpoint', () => {
	it.each(['identity', 'payoutAccount'])('requests %s updates with the authenticated admin actor and an audit entry', async (check) => {
		rpc.mockResolvedValue({ data: `request-${check}`, error: null });
		const result = await POST(context({ check, reason: '  Please update your details.  ', actor: 'forged' }));
		expect(result.status).toBe(201);
		expect(rpc).toHaveBeenCalledWith('request_user_reverification', { p_user_id: userId, p_check: check, p_reason: 'Please update your details.', p_actor: 'Review Admin' });
		expect(await result.json()).toEqual({ ok: true, id: `request-${check}`, check });
		expect(auditFor(userId)[0]).toMatchObject({ actor: 'Review Admin', action: 'USER_REVERIFICATION_REQUESTED', reason: 'Please update your details.' });
	});

	it.each([null, { name: 'Auditor', tier: 3 } as AdminSession])('denies unauthenticated and read-only callers', async (session) => {
		await expect(POST(context({ check: 'identity', reason: 'New ID required.' }, session))).rejects.toMatchObject({ status: session ? 403 : 401 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it.each([null, {}, { check: 'phone', reason: 'No phone re-verification.' }, { check: 'identity', reason: '   ' }, { check: 'payoutAccount', reason: 'a'.repeat(1001) }])('rejects invalid request data', async (body) => {
		await expect(POST(context(body))).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejects invalid user IDs without attempting a mutation', async () => {
		await expect(POST(context({ check: 'identity', reason: 'New ID required.' }, admin, 'not-an-id'))).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('reports database errors and does not create an audit success for a failed request', async () => {
		const before = auditFor(userId).length;
		rpc.mockResolvedValue({ data: null, error: { message: 'Updated details have already been requested for this check' } });
		await expect(POST(context({ check: 'identity', reason: 'New ID required.' }))).rejects.toMatchObject({ status: 400, body: { message: 'Updated details have already been requested for this check' } });
		expect(auditFor(userId)).toHaveLength(before);
	});

	it('does not report success for an empty RPC result', async () => {
		rpc.mockResolvedValue({ data: null, error: null });
		await expect(requestUserReverification(userId, 'identity', 'New details.', admin.name)).rejects.toThrow(/could not be saved/);
	});
});

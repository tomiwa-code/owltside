import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseSource } from '$lib/server/datasource';
import { POST } from '../../src/routes/api/approvals/+server';

const { from, updateUser } = vi.hoisted(() => ({ from: vi.fn(), updateUser: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => ({ from, auth: { updateUser } }) }));

const userId = '11111111-2222-4333-8444-555555555555';
let latestStatus: string | null;
let readError: { message: string } | null;
let inserted: Record<string, unknown> | null;
const context = (body: unknown) => ({
	request: new Request('http://app.test/api/approvals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
	locals: { session: { userId, email: 'member@example.com', name: 'Member', handle: 'member', role: 'attendee' } },
	cookies: {}
}) as never;

beforeEach(() => {
	latestStatus = null;
	readError = null;
	inserted = null;
	updateUser.mockClear();
	from.mockReset();
	from.mockImplementation((table: string) => {
		if (table === 'notifications') return { insert: vi.fn().mockResolvedValue({ error: null }) };
		const query = {
			select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), insert: vi.fn(),
			maybeSingle: vi.fn(async () => ({ data: latestStatus ? { status: latestStatus } : null, error: readError })),
			single: vi.fn(async () => ({ data: { ...inserted, id: 'request-1', status: 'pending', created_at: '2026-11-05T10:00:00Z' }, error: null }))
		};
		for (const name of ['select', 'eq', 'order', 'limit'] as const) query[name].mockReturnValue(query);
		query.insert.mockImplementation((data) => { inserted = data; return query; });
		return query;
	});
});

describe('public verification API', () => {
	it('stores a phone submission for approval, ignoring any client decision or OTP', async () => {
		const result = await POST(context({ kind: 'verification', check: 'phone', status: 'approved', decidedBy: 'forged admin', otp: '123456', details: { phone: '+234 803 123 4567' } }));
		expect(result.status).toBe(201);
		expect(await result.json()).toMatchObject({ kind: 'verification', status: 'pending', summary: 'Phone number +2348031234567 submitted for review', payload: { check: 'phone', phone: '+2348031234567' } });
		expect(inserted).not.toHaveProperty('status');
		expect(updateUser).not.toHaveBeenCalled();
	});

	it.each(['identity', 'payoutAccount', 'phone'])('refuses a second %s submission after approval', async (check) => {
		latestStatus = 'approved';
		const result = await POST(context({ kind: 'verification', check, details: { phone: '+2348031234567', bank: 'GTBank', accountNumber: '0123456789' } }));
		expect(result.status).toBe(400);
		expect(await result.json()).toMatchObject({ error: expect.stringContaining('Only an admin') });
		expect(inserted).toBeNull();
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('rejects duplicate pending submissions', async () => {
		latestStatus = 'pending';
		const result = await POST(context({ kind: 'verification', check: 'phone', details: { phone: '+2348031234567' } }));
		expect(result.status).toBe(400);
		expect(await result.json()).toMatchObject({ error: expect.stringContaining('awaiting approval') });
		expect(inserted).toBeNull();
	});

	it.each(['reverification_required', 'rejected'])('accepts updated details when the latest state is %s', async (status) => {
		latestStatus = status;
		const result = await POST(context({ kind: 'verification', check: 'payoutAccount', details: { bank: 'GTBank', accountNumber: '0123456789' } }));
		expect(result.status).toBe(201);
		expect(await result.json()).toMatchObject({ status: 'pending' });
	});

	it('fails closed when verification history is unavailable', async () => {
		readError = { message: 'Review history unavailable' };
		const result = await POST(context({ kind: 'verification', check: 'phone', details: { phone: '+2348031234567' } }));
		expect(result.status).toBe(400);
		expect(inserted).toBeNull();
		expect(updateUser).not.toHaveBeenCalled();
	});

	it.each([null, [], { kind: 'verification', check: 'email' }, { kind: 'verification', check: 'phone', details: { phone: '+123456' } }])('rejects invalid submissions without writing data', async (body) => {
		const result = await POST(context(body));
		expect(result.status).toBe(400);
		expect(inserted).toBeNull();
	});
});


describe('verification history reads', () => {
	it('retains all three current checks beyond the recent-request history limit', async () => {
		const recent = Array.from({ length: 100 }, (_, index) => ({
			id: `refund-${index}`, requester_id: userId, kind: 'refund', status: 'pending',
			title: 'Refund', summary: '', payload: {}, created_at: '2026-11-05T10:00:00Z'
		}));
		from.mockImplementation(() => {
			let check: string | undefined;
			const query = {
				select: vi.fn(), eq: vi.fn(), order: vi.fn(),
				limit: vi.fn(async () => ({ data: check ? [{
					id: `old-${check}`, requester_id: userId, kind: 'verification', status: 'approved',
					title: 'Verification', summary: '', payload: { check }, created_at: '2025-01-01T10:00:00Z'
				}] : recent, error: null }))
			};
			query.select.mockReturnValue(query);
			query.order.mockReturnValue(query);
			query.eq.mockImplementation((column, value) => { if (column === 'payload->>check') check = value; return query; });
			return query;
		});
		const rows = await supabaseSource({ from } as never).listApprovals(userId);
		expect(rows).toHaveLength(103);
		expect(rows.filter((row) => row.kind === 'verification').map((row) => row.payload?.check)).toEqual(['phone', 'identity', 'payoutAccount']);
		expect(rows.filter((row) => row.kind === 'verification').every((row) => row.status === 'approved')).toBe(true);
	});
});

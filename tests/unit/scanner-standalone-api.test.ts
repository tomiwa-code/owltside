import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = vi.hoisted(() => ({
	getOrganizer: vi.fn(),
	getEventTickets: vi.fn(),
	checkInTicket: vi.fn(),
	verifyGateToken: vi.fn(),
	verifyScannerToken: vi.fn(),
	issueGateToken: vi.fn(),
	issueScannerToken: vi.fn()
}));
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null }));
vi.mock('$lib/server/datasource', () => ({ getSource: () => source }));

import { POST as authorize } from '../../src/routes/api/scan/authorize/+server';
import { POST as scan } from '../../src/routes/api/scan/+server';
import { POST as gateToken } from '../../src/routes/api/organizer/gate-token/+server';

type Handler = (event: never) => Promise<Response>;

const post = (handler: Handler, body: unknown) =>
	handler({
		request: new Request('http://localhost/api', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { session: { userId: 'u-ada', role: 'organizer' } },
		cookies: { get: () => '' }
	} as never);

async function expectHttpError(promise: Promise<Response>, status: number) {
	try {
		await promise;
		expect.unreachable('handler should have thrown');
	} catch (caught) {
		expect(caught).toMatchObject({ status });
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	source.getOrganizer.mockResolvedValue({ events: [], stats: {}, checkins: [], orders: [] });
	source.verifyScannerToken.mockResolvedValue(false);
	source.verifyGateToken.mockResolvedValue(false);
});

describe('standalone scanner terminal API', () => {
	it('issues a terminal PIN without any event or gate', async () => {
		source.issueScannerToken.mockResolvedValue({ code: '424242', expiresAt: new Date(Date.now() + 3600_000).toISOString() });

		const response = await post(gateToken as Handler, {});
		const result = await response.json();

		expect(source.issueScannerToken).toHaveBeenCalledWith('u-ada');
		expect(source.issueGateToken).not.toHaveBeenCalled();
		expect(result).toMatchObject({ gate: null, code: '424242' });
	});

	it('arms with the terminal PIN and no event context', async () => {
		source.verifyScannerToken.mockResolvedValue(true);

		const response = await post(authorize as Handler, { code: '424242' });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ authorized: true });
		expect(source.verifyScannerToken).toHaveBeenCalledWith('u-ada', '424242');
		expect(source.verifyGateToken).not.toHaveBeenCalled();
	});

	it('rejects a wrong terminal PIN', async () => {
		await expectHttpError(post(authorize as Handler, { code: '000000' }), 403);
	});

	it('rejects a half-specified event context', async () => {
		await expectHttpError(post(authorize as Handler, { code: '424242', eventId: 'e-1' }), 400);
		await expectHttpError(post(scan as Handler, { staffToken: '424242', gate: 'Gate 1', code: 'EV-1' }), 400);
	});

	it('reports an unknown ticket code as invalid when no event exists yet', async () => {
		source.verifyScannerToken.mockResolvedValue(true);

		const response = await post(scan as Handler, { staffToken: '424242', code: 'EV-NOPE-0000' });
		const result = await response.json();

		expect(result).toMatchObject({ result: 'invalid', ticketCode: 'EV-NOPE-0000', gate: 'Terminal' });
		expect(source.checkInTicket).not.toHaveBeenCalled();
	});

	it('resolves a scanned code against tickets from all the organizer events', async () => {
		source.verifyScannerToken.mockResolvedValue(true);
		source.getOrganizer.mockResolvedValue({
			events: [
				{ id: 'e-1', gates: [] },
				{ id: 'e-2', gates: [] }
			],
			stats: {},
			checkins: [],
			orders: []
		});
		source.getEventTickets.mockImplementation(async (eventId: string) =>
			eventId === 'e-2' ? [{ code: 'EV-HIT-0001', status: 'valid' }] : []
		);
		source.checkInTicket.mockResolvedValue({
			id: 'ck-1',
			eventId: 'e-2',
			ticketCode: 'EV-HIT-0001',
			holder: 'Ada',
			tier: 'General',
			gate: 'Terminal',
			at: new Date().toISOString(),
			result: 'verified'
		});

		const response = await post(scan as Handler, { staffToken: '424242', code: 'EV-HIT-0001' });
		const result = await response.json();

		expect(source.checkInTicket).toHaveBeenCalledWith('e-2', 'EV-HIT-0001', 'Terminal');
		expect(result).toMatchObject({ result: 'verified', eventId: 'e-2' });
	});

	it('does not scan in terminal mode without a valid terminal PIN', async () => {
		await expectHttpError(post(scan as Handler, { staffToken: '000000', code: 'EV-HIT-0001' }), 403);
		expect(source.checkInTicket).not.toHaveBeenCalled();
	});

	it('event-gate mode still accepts the gate PIN exactly as before', async () => {
		source.getOrganizer.mockResolvedValue({
			events: [{ id: 'e-1', gates: [{ id: 'g1', name: 'Gate 1', modes: ['QR'], staff: [] }] }],
			stats: {},
			checkins: [],
			orders: []
		});
		source.verifyGateToken.mockResolvedValue(true);
		source.checkInTicket.mockResolvedValue({
			id: 'ck-2',
			eventId: 'e-1',
			ticketCode: 'EV-HIT-0002',
			holder: 'Tunde',
			tier: 'VIP',
			gate: 'Gate 1',
			at: new Date().toISOString(),
			result: 'verified'
		});

		const response = await post(scan as Handler, {
			eventId: 'e-1',
			gate: 'Gate 1',
			staffToken: '123456',
			code: 'EV-HIT-0002'
		});
		const result = await response.json();

		expect(source.verifyGateToken).toHaveBeenCalledWith('u-ada', 'e-1', 'Gate 1', '123456');
		expect(source.checkInTicket).toHaveBeenCalledWith('e-1', 'EV-HIT-0002', 'Gate 1');
		expect(result.result).toBe('verified');
	});
});

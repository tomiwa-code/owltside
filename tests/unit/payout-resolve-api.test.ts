import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { POST as resolvePayout } from '../../src/routes/api/payout/resolve/+server';

type Handler = (event: never) => Promise<Response>;

const call = (body: unknown, session: object | null = { userId: 'u-ada', name: 'Ada Obi' }) =>
	(resolvePayout as Handler)({
		request: new Request('http://localhost/api/payout/resolve', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { session }
	} as never);

const jsonResponse = (payload: unknown, status = 200) =>
	new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

describe('POST /api/payout/resolve', () => {
	beforeEach(() => {
		delete env.PAYSTACK_SECRET_KEY;
	});

	afterEach(() => {
		delete env.PAYSTACK_SECRET_KEY;
		vi.unstubAllGlobals();
	});

	it('rejects signed-out visitors', async () => {
		const response = await call({ bank: 'GTBank', accountNumber: '0123456789' }, null);
		expect(response.status).toBe(401);
	});

	it('rejects unknown banks and incomplete numbers', async () => {
		expect((await call({ bank: 'Bank of Nowhere', accountNumber: '0123456789' })).status).toBe(400);
		expect((await call({ bank: 'GTBank', accountNumber: '012345678' })).status).toBe(400);
	});

	it('answers for the account, not for the signed-in user', async () => {
		const own = await (await call({ bank: 'GTBank', accountNumber: '0123456789' })).json();
		const other = await (await call({ bank: 'GTBank', accountNumber: '9876543210' })).json();

		expect(own).toMatchObject({ ok: true, accountName: 'ADA OBI', simulated: true });
		expect(other).toMatchObject({ ok: true, accountName: 'AMINA BELLO', simulated: true });
		expect(own.accountName).not.toBe(other.accountName);
	});

	it('accepts a pasted number with spaces', async () => {
		const payload = await (await call({ bank: 'GTBank', accountNumber: '012 345 6789' })).json();
		expect(payload.accountName).toBe('ADA OBI');
	});

	it('uses the live register when a Paystack key is configured', async () => {
		env.PAYSTACK_SECRET_KEY = 'sk_test_123';
		const fetchMock = vi.fn(async () =>
			jsonResponse({ status: true, data: { account_name: 'Chinedu Okafor' } })
		);
		vi.stubGlobal('fetch', fetchMock);

		const payload = await (await call({ bank: 'GTBank', accountNumber: '8023456781' })).json();

		expect(payload).toEqual({ ok: true, accountName: 'Chinedu Okafor', simulated: false });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain('/bank/resolve');
		expect(url).toContain('account_number=8023456781');
		expect(url).toContain('bank_code=058');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_123');
	});

	it('never invents a name when the live lookup fails', async () => {
		env.PAYSTACK_SECRET_KEY = 'sk_test_123';
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({ status: false, message: 'Could not resolve account name' }, 422)
			)
		);

		const response = await call({ bank: 'GTBank', accountNumber: '8023456781' });
		const payload = await response.json();

		expect(response.status).toBe(502);
		expect(payload.error).toBe('Could not resolve account name');
		expect(payload.accountName).toBeUndefined();
	});
});

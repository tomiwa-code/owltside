import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/routes/api/announcements/+server';
import { sendPlatformAnnouncement } from '../src/lib/server/announcements';
import { auditFor } from '../src/lib/server/store';
import type { AdminSession } from '../src/lib/types';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/server/supabase-data', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/lib/server/supabase-data')>();
	return { ...original, createAdminClient: () => ({ rpc }) };
});

const admin = { name: 'Platform Admin', tier: 1 } as AdminSession;
const row = {
	announcement_id: 'announcement-1',
	title: 'Community update',
	body: 'The new Owltside experience is live.',
	recipient_count: 42,
	sent_by: 'Platform Admin',
	sent_at: '2026-11-05T12:00:00.000Z'
};

function context(body: unknown, session: AdminSession | null = admin) {
	return {
		locals: { admin: session },
		request: new Request('http://admin.test/api/announcements', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => rpc.mockReset());

describe('admin platform announcements', () => {
	it('sends trimmed content through the all-user RPC with the authenticated admin actor', async () => {
		rpc.mockResolvedValue({ data: [row], error: null });
		const response = await POST(context({
			title: '  Community update  ',
			body: '  The new Owltside experience is live.  ',
			sentBy: 'Forged actor'
		}));

		expect(response.status).toBe(201);
		expect(rpc).toHaveBeenCalledWith('send_platform_announcement', {
			p_title: 'Community update',
			p_body: 'The new Owltside experience is live.',
			p_sent_by: 'Platform Admin'
		});
		expect(await response.json()).toEqual({
			ok: true,
			announcement: {
				id: 'announcement-1',
				title: 'Community update',
				body: 'The new Owltside experience is live.',
				recipientCount: 42,
				sentBy: 'Platform Admin',
				sentAt: '2026-11-05T12:00:00.000Z'
			}
		});
		expect(auditFor('announcement-1')[0]).toMatchObject({
			actor: 'Platform Admin',
			action: 'PLATFORM_ANNOUNCEMENT_SENT',
			entityKind: 'announcement'
		});
	});

	it.each([null, { name: 'Read Only', tier: 3 } as AdminSession])(
		'denies unauthenticated and read-only callers',
		async (session) => {
			await expect(POST(context({ title: 'Update', body: 'Message' }, session))).rejects.toMatchObject({
				status: session ? 403 : 401
			});
			expect(rpc).not.toHaveBeenCalled();
		}
	);

	it.each([
		{},
		{ title: 'Update' },
		{ body: 'Message' },
		{ title: '   ', body: 'Message' },
		{ title: 'Update', body: '   ' },
		{ title: 'x'.repeat(101), body: 'Message' },
		{ title: 'Update', body: 'x'.repeat(2001) }
	])('rejects invalid content before touching the database', async (input) => {
		await expect(POST(context(input))).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('does not record a successful audit when delivery fails', async () => {
		const auditCount = auditFor('announcement-1').length;
		rpc.mockResolvedValue({ data: null, error: { message: 'notification insert failed' } });
		await expect(sendPlatformAnnouncement({ title: 'Update', body: 'Message' }, admin.name)).rejects.toThrow(
			'notification insert failed'
		);
		expect(auditFor('announcement-1')).toHaveLength(auditCount);
	});

	it('rejects an empty RPC result instead of claiming users were notified', async () => {
		rpc.mockResolvedValue({ data: [], error: null });
		await expect(sendPlatformAnnouncement({ title: 'Update', body: 'Message' }, admin.name)).rejects.toThrow(
			/could not be saved/i
		);
	});
});

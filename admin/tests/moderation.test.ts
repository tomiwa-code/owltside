import { beforeEach, describe, expect, it } from 'vitest';
import { decideSubmission, listSubmissions, moderationMode } from '$admin/server/moderation';
import { getEvent, resetDemoStore } from '$admin/server/store';

describe('organizer submission queue', () => {
	beforeEach(() => {
		resetDemoStore();
		delete process.env.SUPABASE_URL;
		delete process.env.PUBLIC_SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	it('moderates the demo dataset when Supabase is not configured', () => {
		expect(moderationMode()).toBe('demo');
	});

	it('lists only pending submissions with the details reviewers need', async () => {
		const rows = await listSubmissions();
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row.status === 'pending')).toBe(true);
		for (const row of rows) {
			expect(getEvent(row.id)?.status).toBe('pending');
			expect(row.title.length).toBeGreaterThan(0);
			expect(row.organizerName.length).toBeGreaterThan(0);
			expect(row.startsAt).toBeTruthy();
			expect(row.venue).toBeTruthy();
		}
	});

	it('approve & publish flips the event to published and clears the queue', async () => {
		const [row] = await listSubmissions();
		const result = await decideSubmission(row.id, 'approve', 'Test admin');

		expect(result).toEqual({ id: row.id, status: 'published' });
		expect(getEvent(row.id)?.status).toBe('published');
		expect((await listSubmissions()).some((item) => item.id === row.id)).toBe(false);
	});

	it('rejecting records the reason for the organizer', async () => {
		const [row] = await listSubmissions();
		const result = await decideSubmission(row.id, 'reject', 'Test admin', 'Duplicate listing');

		expect(result.status).toBe('rejected');
		expect(getEvent(row.id)?.moderationNote).toBe('Duplicate listing');
		expect((await listSubmissions()).some((item) => item.id === row.id)).toBe(false);
	});

	it('requires a reason to reject and leaves the submission pending', async () => {
		const [row] = await listSubmissions();
		await expect(decideSubmission(row.id, 'reject', 'Test admin', '   ')).rejects.toThrow(/reason/i);
		expect(getEvent(row.id)?.status).toBe('pending');
	});

	it('cannot decide the same submission twice', async () => {
		const [row] = await listSubmissions();
		await decideSubmission(row.id, 'approve', 'Test admin');
		await expect(decideSubmission(row.id, 'approve', 'Test admin')).rejects.toThrow(
			/no longer in the review queue/i
		);
	});
});

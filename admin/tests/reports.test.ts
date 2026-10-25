import { beforeEach, describe, expect, it } from 'vitest';
import { decideReport, listReports, reportMode } from '$admin/server/reports';
import { countReports, getReport, getReportsData, resetDemoStore } from '$admin/server/store';

/**
 * Reports filed by the public app are reviewed here; the public app can never
 * resolve or read them.
 */
describe('content report queue', () => {
	beforeEach(() => {
		resetDemoStore();
		delete process.env.SUPABASE_URL;
		delete process.env.PUBLIC_SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	it('falls back to the demo dataset without Supabase credentials', () => {
		expect(reportMode()).toBe('demo');
	});

	it('lists both listing and profile reports with the reported details', async () => {
		const { rows, mode } = await listReports();
		expect(mode).toBe('demo');
		expect(rows.length).toBeGreaterThan(0);
		expect(new Set(rows.map((row) => row.targetType))).toEqual(new Set(['event', 'profile']));
		for (const row of rows) {
			expect(row.targetLabel.length).toBeGreaterThan(0);
			expect(row.categoryLabel.length).toBeGreaterThan(0);
			expect(row.details.length).toBeGreaterThan(10);
			expect(row.context.length).toBeGreaterThan(0);
		}
		expect(rows.some((row) => row.status === 'open')).toBe(true);
	});

	it('counts open reports for the sidebar badge', () => {
		const open = getReportsData().rows.filter((row) => row.status === 'open').length;
		expect(countReports()).toBe(open);
		expect(open).toBeGreaterThan(0);
	});

	it('actions a report with a mandatory note', async () => {
		const report = getReportsData().rows.find((row) => row.status === 'open' && row.targetType === 'event');
		expect(report).toBeTruthy();

		await expect(decideReport(report!.id, 'action', 'Test admin', '   ')).rejects.toThrow(/note/i);

		const result = await decideReport(
			report!.id,
			'action',
			'Test admin',
			'Listing suspended pending a corrected line-up.'
		);
		expect(result).toEqual({ id: report!.id, status: 'actioned' });
		const after = getReport(report!.id);
		expect(after?.status).toBe('actioned');
		expect(after?.reviewerName).toBe('Test admin');
		expect(after?.reviewNote).toMatch(/suspended/i);
	});

	it('dismisses a report without touching the target', async () => {
		const report = getReportsData().rows.find((row) => row.status === 'open' && row.targetType === 'profile');
		expect(report).toBeTruthy();
		const result = await decideReport(report!.id, 'dismiss', 'Test admin', 'Reviewed the account — within guidelines.');
		expect(result.status).toBe('dismissed');
		expect(getReport(report!.id)?.status).toBe('dismissed');
	});

	it('cannot review the same report twice', async () => {
		const report = getReportsData().rows.find((row) => row.status === 'open');
		expect(report).toBeTruthy();
		await decideReport(report!.id, 'dismiss', 'Test admin', 'Nothing wrong here.');
		await expect(decideReport(report!.id, 'action', 'Test admin', 'Changed my mind.')).rejects.toThrow(
			/no longer open/i
		);
	});
});

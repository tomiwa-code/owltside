import { describe, expect, it } from 'vitest';
import { REPORTS, toCsv } from '$admin/server/export';

describe('CSV export contract', () => {
	it('escapes commas, quotes and newlines (RFC 4180)', () => {
		const csv = toCsv(
			[
				{ key: 'name', label: 'Name' },
				{ key: 'note', label: 'Note' }
			],
			[
				{ name: 'Owltside, Ltd', note: 'He said "gate 2"\r\nnext line' },
				{ name: 'Plain', note: null }
			]
		);
		expect(csv.split('\r\n')[0]).toBe('Name,Note');
		expect(csv).toContain('"Owltside, Ltd","He said ""gate 2""');
		expect(csv.endsWith('Plain,')).toBe(true);
	});

	it('exposes a report for every toolbar export link', () => {
		const expected = [
			'dashboard',
			'overview',
			'events',
			'organizers',
			'users',
			'tickets',
			'orders',
			'refunds',
			'moderation',
			'audit',
			'staff',
			'settlements'
		];
		for (const key of expected) {
			const report = REPORTS[key];
			expect(report, `missing report: ${key}`).toBeDefined();
			const rows = report.rows();
			expect(rows.length).toBeGreaterThan(0);
			expect(rows[0]).toHaveProperty(report.columns[0].key);
		}
	});

	it('keeps naira amounts machine-readable (no separators or currency glyphs)', () => {
		const rows = REPORTS.orders.rows();
		for (const row of rows) {
			expect(String(row.total_ngn)).toMatch(/^\d+\.\d{2}$/);
		}
	});

	it('produces a header-only frame for an empty dataset', () => {
		const csv = toCsv([{ key: 'a', label: 'A' }], []);
		expect(csv).toBe('A');
	});
});

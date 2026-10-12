import type { Ticket } from '$lib/types';

/** RFC-4180-ish CSV: quotes anything containing commas/quotes/newlines. */
function csvCell(v: string | number): string {
	const s = String(v ?? '');
	return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function ticketsToCsv(tickets: Ticket[]): string {
	const rows = [
		['Code', 'Holder', 'Tier', 'Price', 'Status', 'Purchased', 'Event'].map(csvCell).join(','),
		...tickets.map((t) =>
			[
				t.code,
				t.holder,
				t.tierName,
				t.price,
				t.status,
				new Date(t.purchasedAt).toISOString().slice(0, 16).replace('T', ' '),
				t.eventTitle
			]
				.map(csvCell)
				.join(',')
		)
	];
	return rows.join('\n');
}

/** Browser download helper (no-op in SSR). */
export function downloadCsv(filename: string, csv: string) {
	if (typeof document === 'undefined') return;
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

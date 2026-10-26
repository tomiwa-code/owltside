import type { PageServerLoad } from './$types';
import { countAudit, getAuditEntry, listAudit } from '$admin/server/store';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const severity = url.searchParams.get('severity') ?? 'all';
	const kind = url.searchParams.get('kind') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const table = listAudit({ q, severity, kind, page, perPage: 8 });
	const requested = url.searchParams.get('log');
	const selected = requested ? getAuditEntry(requested) : table.rows[0] ?? null;

	return {
		table: { rows: table.rows, total: table.total, page: table.page, pages: table.pages, perPage: table.perPage },
		filters: { q, severity, kind },
		counts: countAudit(),
		selected,
		selectedId: selected?.id ?? null
	};
};

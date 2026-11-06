import type { PageServerLoad } from './$types';
import { listAdminStaff } from '$admin/server/admin-access';
import { countAudit, getAuditEntry, listAudit } from '$admin/server/store';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const severity = url.searchParams.get('severity') ?? 'all';
	const kind = url.searchParams.get('kind') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const table = listAudit({ q, severity, kind, page, perPage: 8 });
	const requested = url.searchParams.get('log');
	const selected = requested ? getAuditEntry(requested) : table.rows[0] ?? null;
	const activeAdmins = await listAdminStaff()
		.then((staff) => staff.filter((member) => member.status === 'active').length)
		.catch(() => 0);

	return {
		table: { rows: table.rows, total: table.total, page: table.page, pages: table.pages, perPage: table.perPage },
		filters: { q, severity, kind },
		counts: countAudit(activeAdmins),
		selected,
		selectedId: selected?.id ?? null
	};
};

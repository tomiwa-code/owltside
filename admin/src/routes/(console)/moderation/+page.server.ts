import type { PageServerLoad } from './$types';
import { countCases, getCase, listCases } from '$admin/server/store';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = url.searchParams.get('status') ?? 'active';
	const severity = url.searchParams.get('severity') ?? 'high';
	const cases = listCases({ q, status: status === 'active' ? 'all' : status, severity: severity === 'high' ? 'all' : severity });
	const requested = url.searchParams.get('case');
	const open = cases.filter((item) => ['open', 'escalated', 'quarantined', 'reviewing'].includes(item.status));
	const pool = status === 'active' ? open : cases;
	const selected = (requested ? getCase(requested) : null) ?? pool[0] ?? cases[0] ?? null;
	return {
		cases,
		open,
		selected,
		selectedId: selected?.id ?? null,
		filters: { q, status, severity },
		counts: countCases()
	};
};

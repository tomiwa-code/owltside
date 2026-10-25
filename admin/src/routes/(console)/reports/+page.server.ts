import type { PageServerLoad } from './$types';
import { listReports, reportMode } from '$admin/server/reports';

export const load: PageServerLoad = async ({ url }) => {
	let rows = [] as Awaited<ReturnType<typeof listReports>>['rows'];
	let error = '';
	try {
		rows = (await listReports()).rows;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'The report queue could not be loaded.';
	}
	const requested = url.searchParams.get('report');
	const open = rows.filter((row) => row.status === 'open');
	const selected = rows.find((row) => row.id === requested) ?? open[0] ?? rows[0] ?? null;
	return {
		rows,
		mode: reportMode(),
		error,
		selectedId: selected?.id ?? null,
		counts: {
			all: rows.length,
			open: open.length,
			actioned: rows.filter((row) => row.status === 'actioned').length,
			dismissed: rows.filter((row) => row.status === 'dismissed').length
		}
	};
};

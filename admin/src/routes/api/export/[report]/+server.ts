import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAudit } from '$admin/server/auth';
import { REPORTS, toCsv } from '$admin/server/export';

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAudit(locals.admin);
	const report = REPORTS[params.report];
	if (!report) error(404, 'Unknown export report.');
	const rows = await report.rows();
	const csv = toCsv(report.columns, rows);
	return new Response(`\uFEFF${csv}`, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${report.filename}"`,
			'cache-control': 'no-store',
			'x-report-rows': String(rows.length)
		}
	});
};

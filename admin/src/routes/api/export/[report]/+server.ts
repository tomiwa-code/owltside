import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAudit } from '$admin/server/auth';
import { REPORTS, toCsv } from '$admin/server/export';

export const GET: RequestHandler = ({ params, locals }) => {
	requireAudit(locals.admin);
	const report = REPORTS[params.report];
	if (!report) error(404, 'Unknown export report.');
	const csv = toCsv(report.columns, report.rows());
	return new Response(`\uFEFF${csv}`, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${report.filename}"`,
			'cache-control': 'no-store',
			'x-report-rows': String(report.rows().length)
		}
	});
};

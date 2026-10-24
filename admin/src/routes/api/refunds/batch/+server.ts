import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';
import { decideRefund, getRefundsData } from '$admin/server/store';

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireConfigure(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
	const eligible = getRefundsData()
		.rows.filter((refund) => refund.status === 'pending' && refund.policyMatch >= 90)
		.map((refund) => refund.id);
	const ids = body.ids?.filter((id) => eligible.includes(id)) ?? eligible;
	if (ids.length === 0) error(400, 'No eligible refunds in the queue.');
	const processed = ids.map((id) => decideRefund(id, 'approve', admin.name, 'Batch approval — policy window verified')).filter(Boolean);
	return json({ ok: true, processed: processed.length });
};

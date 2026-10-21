import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';
import { decideRefund, getRefund } from '$admin/server/store';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireConfigure(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { decision?: string; note?: string };
	if (body.decision !== 'approve' && body.decision !== 'reject') error(400, 'Decision must be approve or reject.');
	const refund = getRefund(params.id);
	if (!refund) error(404, 'Refund request not found.');
	const updated = decideRefund(refund.id, body.decision, admin.name, body.note ?? '');
	return json({ ok: true, refund: updated });
};

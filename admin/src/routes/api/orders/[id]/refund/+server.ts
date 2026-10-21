import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';
import { getOrder, initiateRefund } from '$admin/server/store';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireConfigure(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { reason?: string };
	const order = getOrder(params.id);
	if (!order) error(404, 'Order not found.');
	if (order.status !== 'settled') error(400, 'Only settled orders can be reversed.');
	const refund = initiateRefund(order.id, admin.name, body.reason || 'Admin-initiated refund from transaction ledger');
	return json({ ok: true, refund });
};

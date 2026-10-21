import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { getTicket, reissueTicket, voidTicket } from '$admin/server/store';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string };
	const ticket = getTicket(params.id);
	if (!ticket) error(404, 'Ticket not found.');

	if (body.action === 'void') {
		return json({ ok: true, ticket: voidTicket(ticket.id, admin.name, body.reason || 'Pass revoked by admin') });
	}
	if (body.action === 'reissue') {
		return json({ ok: true, ticket: reissueTicket(ticket.id, admin.name, body.reason || 'Pass re-issued by admin') });
	}
	error(400, 'Unknown ticket action.');
};

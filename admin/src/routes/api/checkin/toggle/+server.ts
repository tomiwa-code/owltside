import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { getTicket, setTicketCheckin } from '$admin/server/store';

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { id?: string; checkedIn?: boolean };
	if (!body.id) error(400, 'A ticket id is required.');
	if (!getTicket(body.id)) error(404, 'Ticket not found.');
	const ticket = setTicketCheckin(body.id, body.checkedIn !== false, admin.name);
	return json({ ok: true, ticket });
};

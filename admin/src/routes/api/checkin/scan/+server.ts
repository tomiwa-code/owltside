import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { findTicketByCode, setTicketCheckin } from '$admin/server/store';

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { code?: string };
	const ticket = findTicketByCode(body.code ?? '');
	if (!ticket) return json({ ok: false, error: 'No pass matches that code.' }, { status: 404 });
	if (ticket.status === 'void' || ticket.status === 'refunded') {
		return json({ ok: false, error: `Pass is ${ticket.status} — entry denied.`, ticket }, { status: 409 });
	}
	const updated =
		ticket.status === 'checked_in' ? ticket : setTicketCheckin(ticket.id, true, admin.name, 'Scanner #92 (console)');
	return json({ ok: true, ticket: updated, alreadyCheckedIn: ticket.status === 'checked_in' });
};

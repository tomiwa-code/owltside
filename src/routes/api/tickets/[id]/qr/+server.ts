import { error, json } from '@sveltejs/kit';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { signTicketToken } from '$lib/server/qr-sign';
import type { RequestHandler } from './$types';

/**
 * Mint a rotating, server-signed QR token for one of the caller's own passes.
 * The scanner verifies this signature, so a screenshot or a hand-built payload
 * for someone else's code does not scan.
 */
export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.session?.userId) {
		error(401, 'Sign in to view your pass.');
	}

	const source = getSource(createSupabase(cookies));
	const tickets = await source.getTickets(locals.session.userId);
	const ticket = tickets.find((item) => item.id === params.id);
	if (!ticket) error(404, 'Ticket not found');
	if (ticket.status !== 'valid') error(403, 'This pass is not active.');

	return json(
		{ token: signTicketToken(ticket.code), expiresInSeconds: 30 },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};

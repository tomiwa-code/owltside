import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const tickets = await getSource(createSupabase(cookies)).getTickets(locals.session?.userId ?? 'demo');
	const ticket = tickets.find((t) => t.id === params.id);
	if (!ticket) error(404, 'Ticket not found');
	return { ticket };
};

export const actions: Actions = {
	transfer: async ({ request, params, locals, cookies }) => {
		const source = getSource(createSupabase(cookies));
		if (source.mode === 'supabase' && !locals.session?.userId) {
			return fail(401, { error: 'Please sign in to transfer a ticket.' });
		}
		const form = await request.formData();
		const handle = String(form.get('handle') ?? '').trim().replace(/^@/, '');
		if (!handle) return fail(400, { error: 'Enter a recipient @handle.' });

		try {
			await source.transferTicket(locals.session?.userId ?? 'demo', params.id, handle);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not transfer ticket.' });
		}

		if (source.mode === 'supabase') {
			redirect(303, '/tickets');
		}
		return { transferredTo: handle };
	},
	refund: async ({ params, locals, cookies }) => {
		const source = getSource(createSupabase(cookies));
		if (source.mode === 'supabase' && !locals.session?.userId) {
			return fail(401, { error: 'Please sign in to request a refund.' });
		}
		try {
			await source.refundTicket(locals.session?.userId ?? 'demo', params.id);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not process refund.' });
		}
		return { refunded: true };
	}
};

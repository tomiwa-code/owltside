import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const tickets = await source.getTickets(userId);
	const ticket = tickets.find((t) => t.id === params.id);
	if (!ticket) error(404, 'Ticket not found');
	// Refunds need an admin decision, so surface the outstanding request (if any)
	// rather than pretending the pass was already cancelled.
	const approvals = await source.listApprovals(userId).catch(() => []);
	const refundRequest =
		approvals.find((request) => request.kind === 'refund' && request.subjectId === ticket.id) ?? null;
	return { ticket, refundRequest };
};

export const actions: Actions = {
	transfer: async ({ request, params, locals, cookies }) => {
		const source = getSource(createSupabase(cookies));
		if (source.mode === 'supabase' && !locals.session?.userId) {
			return fail(401, { error: 'Please sign in to transfer a ticket.' });
		}
		const form = await request.formData();
		const rawHandle = String(form.get('recipientHandle') || form.get('handle') || '').trim();
		if (/[,;]/.test(rawHandle) || (rawHandle.match(/@/g)?.length ?? 0) > 1) {
			return fail(400, { error: 'Ticket transfer is 1-to-1. Select a single recipient.' });
		}
		const handle = rawHandle.replace(/^@+/, '').trim();
		if (!handle) return fail(400, { error: 'Enter a recipient @handle.' });

		const activeHandle = (locals.session?.handle ?? (source.mode === 'demo' ? 'adaobi' : ''))
			.trim()
			.replace(/^@+/, '')
			.toLowerCase();
		if (activeHandle && handle.toLowerCase() === activeHandle) {
			return fail(400, { error: 'You cannot transfer a ticket to yourself.' });
		}

		let ticket;
		try {
			ticket = await source.transferTicket(locals.session?.userId ?? 'demo', params.id, handle);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not transfer ticket.' });
		}

		if (source.mode === 'supabase') {
			redirect(303, '/tickets');
		}
		return { transferredTo: handle, ticket };
	},
	refund: async ({ request, params, locals, cookies }) => {
		const source = getSource(createSupabase(cookies));
		if (source.mode === 'supabase' && !locals.session?.userId) {
			return fail(401, { error: 'Please sign in to request a refund.' });
		}
		const form = await request.formData();
		const reason = String(form.get('reason') ?? '').trim();
		const details = String(form.get('details') ?? '').trim();
		const reasons = ['Schedule Conflict', 'Emergency', 'Duplicate Order', 'Other Reason'];
		if (!reasons.includes(reason)) return fail(400, { error: 'Choose a reason for your refund request.' });
		if (details.length > 500) return fail(400, { error: 'Additional context must be 500 characters or fewer.' });
		if (form.get('confirmed') !== 'yes') return fail(400, { error: 'Confirm that you understand the ticket will be cancelled.' });

		// Cancelling the pass is an admin decision: this only opens a pending request.
		try {
			await source.requestTicketRefund(locals.session?.userId ?? 'demo', params.id, { reason, details });
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not submit your refund request.' });
		}
		return { refundRequested: true };
	}
};

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { decideApproval } from '$admin/server/approvals';

/**
 * Approve or reject a request the public app routed here (refund, payout,
 * verification). Approving a refund settles the pass; approving a payout or a
 * verification flips the public app from "pending" to "verified".
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { decision?: string; note?: string };
	const decision = body.decision === 'reject' ? 'reject' : body.decision === 'approve' ? 'approve' : null;
	if (!decision) error(400, "Decision must be 'approve' or 'reject'.");

	try {
		const result = await decideApproval(params.id, decision, admin.name, body.note ?? '');
		return json({ ok: true, ...result });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'The decision could not be saved.');
	}
};

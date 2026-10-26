import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { decideSubmission } from '$admin/server/moderation';

/**
 * Approve & Publish / Reject one organizer submission.
 *
 * Publish writes `events.status = 'published'` in Supabase, which is exactly
 * what the public home and explore feeds filter on.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { decision?: string; note?: string };
	const decision = body.decision === 'reject' ? 'reject' : body.decision === 'approve' ? 'approve' : null;
	if (!decision) error(400, "Decision must be 'approve' or 'reject'.");

	try {
		const result = await decideSubmission(params.id, decision, admin.name, body.note ?? '');
		return json({ ok: true, ...result });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'The decision could not be saved.');
	}
};

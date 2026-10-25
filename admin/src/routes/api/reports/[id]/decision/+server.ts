import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { decideReport } from '$admin/server/reports';

/**
 * Close a report filed from the public app: `action` (the team acted on the
 * content) or `dismiss` (no action needed). A note is mandatory for the audit
 * trail.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { decision?: string; note?: string };
	const decision = body.decision === 'action' ? 'action' : body.decision === 'dismiss' ? 'dismiss' : null;
	if (!decision) error(400, "Decision must be 'action' or 'dismiss'.");

	try {
		const result = await decideReport(params.id, decision, admin.name, body.note ?? '');
		return json({ ok: true, ...result });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'The review could not be saved.');
	}
};

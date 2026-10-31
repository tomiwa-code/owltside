import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { decideApproval } from '$admin/server/approvals';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as {
		decision?: 'approve' | 'reject';
		note?: string;
	};
	if (body.decision !== 'approve' && body.decision !== 'reject') {
		error(400, 'Decision must be "approve" or "reject".');
	}
	try {
		const result = await decideApproval(
			params.id,
			body.decision,
			admin.name,
			typeof body.note === 'string' ? body.note : ''
		);
		return json({ ok: true, ...result });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Refund decision failed.');
	}
};

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { deleteEventRecord } from '$admin/server/admin-actions';

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { reason?: string };
	try {
		const removed = await deleteEventRecord(
			params.id,
			admin.name,
			typeof body.reason === 'string' ? body.reason : ''
		);
		return json({ ok: true, deleted: removed });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Unable to delete event.');
	}
};

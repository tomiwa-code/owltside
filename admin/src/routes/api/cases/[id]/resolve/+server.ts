import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { getCase, resolveCase } from '$admin/server/store';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { action?: string; note?: string };
	if (body.action !== 'warn' && body.action !== 'dismiss' && body.action !== 'freeze') error(400, 'Invalid enforcement action.');
	if (!body.note?.trim() || body.note.trim().length < 12) error(400, 'A justification of at least 12 characters is required for the audit trail.');
	if (!getCase(params.id)) error(404, 'Case not found.');
	const updated = resolveCase(params.id, body.action, admin.name, body.note.trim());
	return json({ ok: true, case: { id: updated?.id, status: updated?.status } });
};

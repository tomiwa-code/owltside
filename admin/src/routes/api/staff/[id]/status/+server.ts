import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import { setStaffStatus } from '$admin/server/store';
import type { AdminStaff } from '$admin/types';

const ALLOWED: AdminStaff['status'][] = ['active', 'invited', 'suspended'];

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireSuper(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { status?: string; reason?: string };
	if (!body.status || !ALLOWED.includes(body.status as AdminStaff['status'])) error(400, 'Invalid staff status.');
	if (params.id === 'adm-01' && body.status === 'suspended') error(409, 'You cannot suspend your own Super Admin identity.');
	const member = setStaffStatus(params.id, body.status as AdminStaff['status'], admin.name, body.reason || 'Access review decision');
	if (!member) error(404, 'Administrator not found.');
	return json({ ok: true, staff: { id: member.id, status: member.status } });
};

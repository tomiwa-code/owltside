import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { getUser, setUserStatus } from '$admin/server/store';
import type { AdminUser } from '$admin/types';
import { adminDataSource } from '$admin/server/supabase-data';

const ALLOWED: AdminUser['status'][] = ['active', 'blocked', 'flagged'];

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (adminDataSource() === 'supabase') error(501, 'User status cannot be changed: the current schema has no admin account-status field.');
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { status?: string; reason?: string };
	if (!body.status || !ALLOWED.includes(body.status as AdminUser['status'])) error(400, 'Invalid account status.');
	const user = getUser(params.id);
	if (!user) error(404, 'User not found.');
	const updated = setUserStatus(user.id, body.status as AdminUser['status'], admin.name, body.reason || 'Account review decision');
	return json({ ok: true, user: { id: updated?.id, status: updated?.status } });
};

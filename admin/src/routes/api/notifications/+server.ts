import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAudit } from '$admin/server/auth';
import { listAdminNotifications } from '$admin/server/notifications';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAudit(locals.admin);
	const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit') ?? 60)));
	const bundle = await listAdminNotifications(limit);
	return json(bundle);
};

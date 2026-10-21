import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import { setLockdown } from '$admin/server/store';

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireSuper(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { armed?: boolean };
	const settings = setLockdown(body.armed === true, admin.name);
	return json({ ok: true, lockdownArmed: settings.lockdownArmed });
};

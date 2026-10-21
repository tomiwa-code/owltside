import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import { verifyLedger } from '$admin/server/store';

export const POST: RequestHandler = ({ locals }) => {
	requireSuper(locals.admin);
	return json({ ok: true, ...verifyLedger() });
};

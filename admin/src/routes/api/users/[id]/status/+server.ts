import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { setUserAccountStatus } from '$admin/server/admin-actions';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as {
		status?: 'active' | 'blocked';
		action?: 'enable' | 'disable';
		reason?: string;
		suspendOwnedEvents?: boolean;
	};

	const action: 'enable' | 'disable' =
		body.action === 'disable' || body.status === 'blocked'
			? 'disable'
			: body.action === 'enable' || body.status === 'active'
				? 'enable'
				: (() => {
						error(400, 'Specify status ("active" | "blocked") or action ("enable" | "disable").');
					})();

	try {
		const result = await setUserAccountStatus(
			params.id,
			action,
			admin.name,
			typeof body.reason === 'string' ? body.reason : '',
			{ suspendOwnedEvents: body.suspendOwnedEvents ?? action === 'disable' }
		);
		return json({ ok: true, user: result });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Unable to update user account status.');
	}
};

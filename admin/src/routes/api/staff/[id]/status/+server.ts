import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import {
	AdminAccessMutationError,
	AdminSchemaError,
	parseTargetAdminRole,
	updateAdminRoleOrAccess
} from '$admin/server/admin-access';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireSuper(locals.admin);
	const body = (await request.json().catch(() => ({}))) as {
		role?: string;
		status?: string;
		reason?: string;
	};

	let nextRole: 'superadmin' | 'admin' | 'user' | null = null;
	if (body.role === 'user' || body.status === 'removed' || body.status === 'suspended') {
		nextRole = 'user';
	} else if (body.role) {
		nextRole = parseTargetAdminRole(body.role);
	} else if (body.status === 'active') {
		nextRole = 'admin';
	}

	if (!nextRole) {
		error(400, 'Specify a valid target role (admin, superadmin, or user).');
	}

	try {
		const updated = await updateAdminRoleOrAccess(
			params.id,
			{ role: nextRole, reason: body.reason },
			admin
		);
		return json({ ok: true, staff: updated });
	} catch (cause) {
		if (cause instanceof AdminAccessMutationError) {
			error(cause.status, cause.message);
		}
		if (cause instanceof AdminSchemaError) {
			error(503, cause.message);
		}
		error(500, cause instanceof Error ? cause.message : 'Could not update administrator role.');
	}
};

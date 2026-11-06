import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import {
	AdminAccessMutationError,
	AdminSchemaError,
	assignAdminRole
} from '$admin/server/admin-access';

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireSuper(locals.admin);
	const body = (await request.json().catch(() => ({}))) as {
		userId?: string;
		name?: string;
		email?: string;
		role?: string;
	};

	try {
		const staff = await assignAdminRole(
			{
				userId: body.userId,
				name: body.name,
				email: body.email,
				role: body.role ?? 'admin'
			},
			admin
		);
		return json({ ok: true, staff }, { status: 201 });
	} catch (cause) {
		if (cause instanceof AdminAccessMutationError) {
			error(cause.status, cause.message);
		}
		if (cause instanceof AdminSchemaError) {
			error(503, cause.message);
		}
		error(500, cause instanceof Error ? cause.message : 'Could not assign administrator role.');
	}
};

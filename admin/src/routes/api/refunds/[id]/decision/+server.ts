import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireConfigure(locals.admin);
	error(501, 'Refunds are handled via the Approvals queue (use /api/approvals/:id/decision).');
};

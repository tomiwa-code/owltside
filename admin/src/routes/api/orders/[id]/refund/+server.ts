import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireConfigure(locals.admin);
	error(501, 'Direct order refunds are not yet implemented against the public Supabase schema. File or approve an approval request from the Approvals queue instead.');
};

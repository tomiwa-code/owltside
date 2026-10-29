import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireMutation(locals.admin);
	error(501, 'User account-status changes are not yet implemented against the public Supabase schema. Use Supabase Auth admin APIs to ban or unban users.');
};

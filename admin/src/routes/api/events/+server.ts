import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireMutation(locals.admin);
	error(501, 'Event creation from the admin console is not yet implemented against the public Supabase schema.');
};

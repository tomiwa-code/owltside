import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireMutation(locals.admin);
	error(501, 'Direct event status changes from this console are not yet implemented against the public Supabase schema. Use the Moderation → Submission Queue page to approve or reject pending events.');
};

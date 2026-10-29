import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireMutation(locals.admin);
	error(501, 'Moderation case resolution is not yet provisioned: there is no cases table in the public Supabase schema.');
};

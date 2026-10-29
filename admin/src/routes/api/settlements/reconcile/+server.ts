import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
	requireConfigure(locals.admin);
	error(501, 'Settlement reconciliation is not yet provisioned: there is no payout-subaccount table in the public Supabase schema.');
};

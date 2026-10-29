import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Federated command-palette search previously ran against the in-memory demo
 * store. A live Supabase-backed version is not yet wired up, so return an
 * empty result set rather than stale seed data.
 */
export const GET: RequestHandler = () => {
	return json({ results: [] });
};

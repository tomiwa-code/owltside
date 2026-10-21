import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { globalSearch } from '$admin/server/store';

export const GET: RequestHandler = ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').slice(0, 80);
	return json({ results: globalSearch(query, 9) });
};

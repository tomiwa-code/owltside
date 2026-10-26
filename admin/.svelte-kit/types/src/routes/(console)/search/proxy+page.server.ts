// @ts-nocheck
import type { PageServerLoad } from './$types';
import { searchHud } from '$admin/server/store';

export const load = ({ url }: Parameters<PageServerLoad>[0]) => {
	const q = url.searchParams.get('q') ?? '';
	return { results: searchHud(q, 6), q };
};

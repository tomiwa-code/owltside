import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	admin: locals.admin,
	mode: 'live' as const
});

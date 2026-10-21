import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	admin: locals.admin,
	mode: process.env.ADMIN_EMAIL ? ('live' as const) : ('demo' as const)
});

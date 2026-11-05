import type { PageServerLoad } from './$types';
import { listAdminNotifications } from '$admin/server/notifications';
import { listPlatformAnnouncements } from '$admin/server/announcements';

export const load: PageServerLoad = async ({ locals }) => {
	const [bundle, announcements] = await Promise.all([
		listAdminNotifications(150),
		// Keep the request feed available while an older database awaits migration 031.
		listPlatformAnnouncements(8).catch(() => [])
	]);
	return {
		bundle,
		announcements,
		canAnnounce: Boolean(locals.admin && locals.admin.tier <= 2)
	};
};

import type { PageServerLoad } from './$types';
import { listAdminNotifications } from '$admin/server/notifications';

export const load: PageServerLoad = async () => {
	const bundle = await listAdminNotifications(150);
	return {
		bundle
	};
};

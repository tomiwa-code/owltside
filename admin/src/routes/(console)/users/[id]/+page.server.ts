import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auditFor, getUser, ordersForEmail, ticketsForHandle } from '$admin/server/store';

export const load: PageServerLoad = ({ params }) => {
	const user = getUser(params.id);
	if (!user) error(404, 'User not found.');
	return {
		user,
		tickets: ticketsForHandle(user.handle, 8),
		orders: ordersForEmail(user.email, 8),
		audit: auditFor(user.id, 6)
	};
};

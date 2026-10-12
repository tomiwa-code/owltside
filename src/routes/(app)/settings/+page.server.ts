import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	signout: async ({ cookies }) => {
		cookies.delete('owltside_demo_session', { path: '/' });
		redirect(303, '/');
	}
};

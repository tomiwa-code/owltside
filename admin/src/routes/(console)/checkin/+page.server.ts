import type { PageServerLoad } from './$types';
import { findTicketByCode, getCheckinOps } from '$admin/server/store';

export const load: PageServerLoad = ({ url }) => {
	const code = url.searchParams.get('code') ?? '';
	const eventId = url.searchParams.get('event');
	const ops = getCheckinOps(eventId);
	return {
		ops,
		lookup: code ? findTicketByCode(code) : null,
		code
	};
};

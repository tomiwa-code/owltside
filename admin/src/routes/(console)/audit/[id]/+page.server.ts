import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuditEntry } from '$admin/server/store';

export const load: PageServerLoad = ({ params }) => {
	const record = getAuditEntry(params.id);
	if (!record) error(404, 'Audit record not found.');
	return { record };
};

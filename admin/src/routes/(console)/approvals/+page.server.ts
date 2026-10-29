import type { PageServerLoad } from './$types';
import { listApprovals } from '$admin/server/approvals';

export const load: PageServerLoad = async ({ url }) => {
	let rows: Awaited<ReturnType<typeof listApprovals>>['rows'] = [];
	let error = '';
	try {
		rows = (await listApprovals()).rows;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'The approval queue could not be loaded.';
	}
	const requested = url.searchParams.get('request');
	const pending = rows.filter((row) => row.status === 'pending');
	const selected =
		rows.find((row) => row.id === requested) ?? pending[0] ?? rows[0] ?? null;
	return {
		rows,
		error,
		selectedId: selected?.id ?? null,
		counts: {
			all: rows.length,
			pending: pending.length,
			approved: rows.filter((row) => row.status === 'approved').length,
			rejected: rows.filter((row) => row.status === 'rejected').length
		},
		source: 'supabase' as const,
		mode: 'supabase' as const
	};
};

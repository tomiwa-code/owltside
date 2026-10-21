import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireConfigure } from '$admin/server/auth';
import { getSettlements, recordPayoutBatch } from '$admin/server/store';

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireConfigure(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { organizerIds?: string[] };
	const settlement = getSettlements();
	const eligible = settlement.rows.filter((row) => row.state === 'settled' || row.state === 'next_batch');
	const ids = body.organizerIds?.filter((id) => eligible.some((row) => row.organizerId === id)) ?? eligible.map((row) => row.organizerId);
	if (ids.length === 0) error(400, 'No settlement profiles are cleared for payout.');
	const { count, totalNgn } = recordPayoutBatch(ids, admin.name);
	return json({ ok: true, count, totalNgn });
};

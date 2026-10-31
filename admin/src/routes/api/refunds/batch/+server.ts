import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { decideApproval, listApprovals } from '$admin/server/approvals';

export const POST: RequestHandler = async ({ locals }) => {
	const admin = requireMutation(locals.admin);
	try {
		const { rows } = await listApprovals();
		const pendingRefunds = rows.filter((row) => row.kind === 'refund' && row.status === 'pending');
		if (pendingRefunds.length === 0) {
			error(400, 'No pending refund requests to process.');
		}
		let processed = 0;
		for (const item of pendingRefunds) {
			await decideApproval(item.id, 'approve', admin.name, 'Batch-approved via Refunds console');
			processed += 1;
		}
		return json({ ok: true, processed });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		error(400, err instanceof Error ? err.message : 'Batch refund approval failed.');
	}
};

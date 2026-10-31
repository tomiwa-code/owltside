import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { createAdminClient } from '$admin/server/supabase-data';
import { setUserAccountStatus } from '$admin/server/admin-actions';
import { logAudit } from '$admin/server/store';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as {
		status?: 'verified' | 'pending' | 'flagged' | 'suspended';
		reason?: string;
	};
	const status = body.status;
	if (!status || !['verified', 'pending', 'flagged', 'suspended'].includes(status)) {
		error(400, 'Invalid organizer status.');
	}

	try {
		const client = createAdminClient();
		if (status === 'suspended') {
			await setUserAccountStatus(
				params.id,
				'disable',
				admin.name,
				body.reason ?? 'Organizer suspended and payouts frozen',
				{ suspendOwnedEvents: true }
			);
		} else {
			await setUserAccountStatus(
				params.id,
				'enable',
				admin.name,
				body.reason ?? `Organizer status set to ${status}`
			);
			const verified = status === 'verified';
			const { error: updateErr } = await client
				.from('profiles')
				.update({ verified })
				.eq('id', params.id);
			if (updateErr) throw new Error(updateErr.message);
			logAudit({
				actor: admin.name,
				action: verified ? 'ORGANIZER_KYB_VERIFIED' : `ORGANIZER_STATUS_${status.toUpperCase()}`,
				kind: 'organizer',
				entityId: params.id,
				target: params.id,
				reason: body.reason ?? `Organizer marked ${status}`,
				severity: status === 'flagged' ? 'warning' : 'info'
			});
		}
		return json({ ok: true, status });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Unable to update organizer status.');
	}
};

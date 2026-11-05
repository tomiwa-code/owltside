import { createAdminClient } from './supabase-data';
import { logAudit } from './store';

export type ReverificationCheck = 'identity' | 'payoutAccount';

/** The RPC records the request, resets verification and notifies the user atomically. */
export async function requestUserReverification(
	userId: string,
	check: ReverificationCheck,
	reason: string,
	actor: string
): Promise<{ id: string; check: ReverificationCheck }> {
	const client = createAdminClient();
	const { data, error } = await client.rpc('request_user_reverification', {
		p_user_id: userId,
		p_check: check,
		p_reason: reason.trim(),
		p_actor: actor
	});
	if (error) throw new Error(error.message);
	if (typeof data !== 'string' || !data) throw new Error('The re-verification request could not be saved.');

	logAudit({
		actor,
		action: 'USER_REVERIFICATION_REQUESTED',
		kind: 'user',
		entityId: userId,
		target: `${userId} · ${check === 'identity' ? 'Identity' : 'Payout account'}`,
		reason: reason.trim(),
		severity: 'warning',
		diff: [{ field: check, before: 'approved', after: 'reverification_required' }]
	});
	return { id: data, check };
}

import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireMutation } from '$admin/server/auth';
import { requestUserReverification } from '$admin/server/verification';
import type { RequestHandler } from './$types';

const schema = z.object({
	check: z.enum(['identity', 'payoutAccount']),
	reason: z.string().trim().min(1, 'Add a reason for the user.').max(1000)
});

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const admin = requireMutation(locals.admin);
	if (!z.uuid().safeParse(params.id).success) error(400, 'Choose a valid user account.');
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Choose a check and add a reason.');

	try {
		const result = await requestUserReverification(params.id, parsed.data.check, parsed.data.reason, admin.name);
		return json({ ok: true, ...result }, { status: 201 });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'The re-verification request could not be saved.');
	}
};

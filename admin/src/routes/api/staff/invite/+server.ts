import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import { inviteStaff } from '$admin/server/store';
import type { AdminRole, AdminTier } from '$admin/types';

const ROLES: AdminRole[] = ['Super Admin', 'Trust & Safety Lead', 'Finance & Treasury', 'Event Operations', 'Support Agent', 'Read-only Auditor'];
const TIERS: AdminTier[] = [0, 1, 2, 3];

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireSuper(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string; role?: AdminRole; tier?: AdminTier };
	if (!body.name?.trim() || !body.email?.includes('@')) error(400, 'A full name and valid work email are required.');
	if (!body.role || !ROLES.includes(body.role)) error(400, 'Select a valid system role.');
	if (body.tier === undefined || !TIERS.includes(body.tier)) error(400, 'Select an access tier (0–3).');
	const staff = inviteStaff({ name: body.name.trim(), email: body.email.trim().toLowerCase(), role: body.role, tier: body.tier }, admin.name);
	return json({ ok: true, staff });
};

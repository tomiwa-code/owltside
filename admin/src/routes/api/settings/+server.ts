import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSuper } from '$admin/server/auth';
import { updateSettings } from '$admin/server/store';
import type { SettingsData } from '$admin/types';

const NUMERIC: (keyof SettingsData)[] = ['platformFeePct', 'escoowDisputePct'];
const BOOLEAN: (keyof SettingsData)[] = ['webhookHealthy'];
const STRING: (keyof SettingsData)[] = ['disbursementWindow', 'webhookEndpoint'];

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireSuper(locals.admin);
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const patch: Partial<SettingsData> = {};
	for (const key of NUMERIC) {
		if (typeof body[key] === 'number') patch[key] = body[key] as never;
	}
	for (const key of BOOLEAN) {
		if (typeof body[key] === 'boolean') patch[key] = body[key] as never;
	}
	for (const key of STRING) {
		if (typeof body[key] === 'string' && (body[key] as string).trim()) patch[key] = (body[key] as string).trim() as never;
	}
	if (Object.keys(patch).length === 0) error(400, 'No recognised settings were provided.');
	if (typeof patch.platformFeePct === 'number' && (patch.platformFeePct < 0 || patch.platformFeePct > 25)) {
		error(400, 'Platform fee must fall between 0% and 25%.');
	}
	const settings = updateSettings(patch, admin.name);
	return json({ ok: true, settings });
};

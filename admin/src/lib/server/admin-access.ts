import { createClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import type { AdminRole, AdminTier } from '$admin/types';

// Keep credentials server-only. Local admin settings take precedence over the
// public app's shared database settings; production uses deployment variables.
if (process.env.NODE_ENV !== 'production') {
	for (const directory of [process.cwd(), resolve(process.cwd(), '..')]) {
		for (const file of [`.env.${process.env.NODE_ENV || 'development'}.local`, '.env.local', `.env.${process.env.NODE_ENV || 'development'}`, '.env']) {
			loadDotenv({ path: resolve(directory, file), override: false });
		}
	}
}

export const ROLE_TIERS: Record<AdminRole, AdminTier> = {
	'Super Admin': 0,
	'Trust & Safety Lead': 1,
	'Finance & Treasury': 1,
	'Event Operations': 2,
	'Support Agent': 2,
	'Read-only Auditor': 3
};

export interface AdminAccess {
	user_id: string;
	name: string;
	role: AdminRole;
	tier: AdminTier;
	is_active: boolean;
	work_email: string;
	session_version: number;
}

export function createAccessClient() {
	const url = process.env.PUBLIC_SUPABASE_URL?.trim();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new Error('Admin Supabase configuration is missing.');
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

/** Never infer admin privileges from profiles or user-editable Auth metadata. */
export async function getAdminAccess(userId: string): Promise<AdminAccess | null> {
	const { data, error } = await createAccessClient()
		.from('admin_accounts')
		.select('user_id, name, role, tier, is_active, work_email, session_version')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw new Error('Admin access lookup failed.');
	if (!data || !data.is_active || !data.name?.trim() || !data.work_email?.trim() ||
		!Number.isSafeInteger(data.session_version) || data.session_version < 1 ||
		!Object.prototype.hasOwnProperty.call(ROLE_TIERS, data.role) ||
		ROLE_TIERS[data.role as AdminRole] !== data.tier) return null;
	return data as AdminAccess;
}

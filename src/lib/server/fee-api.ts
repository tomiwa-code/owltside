import { createSupabase, createSupabaseAdmin } from './supabase';
import type { Cookies } from '@sveltejs/kit';

export async function isPlatformAdmin(cookies: Cookies, userId?: string | null): Promise<boolean> {
	if (!userId) return false;
	const admin = createSupabaseAdmin();
	if (!admin) return false;
	const { data, error } = await admin.from('profiles').select('role,disabled').eq('id', userId).maybeSingle();
	if (error || !data || data.disabled) return false;
	return ['admin', 'superadmin', 'super admin', 'super_admin'].includes(String(data.role ?? '').toLowerCase());
}

export function adminDb() {
	const db = createSupabaseAdmin();
	if (!db) throw new Error('Fee management requires SUPABASE_SERVICE_ROLE_KEY');
	return db;
}

export async function getEventForFee(cookies: Cookies, id: string) {
	const db = createSupabase(cookies);
	if (!db) throw new Error('Database is not configured');
	const { data, error } = await db.from('events').select('id,organizer_id,fee_bearer,tiers').eq('id', id).maybeSingle();
	if (error) throw new Error(error.message);
	return data;
}

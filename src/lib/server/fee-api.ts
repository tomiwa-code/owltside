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

/**
 * Service-role client when the deployment has one, `null` otherwise.
 *
 * Fee *quotes* are display-only and must keep working on a deployment whose
 * web environment has no `SUPABASE_SERVICE_ROLE_KEY` (the database itself
 * prices the real order inside `create_pending_order`). Callers that need the
 * client for a write still use `adminDb()` and fail loudly.
 */
export function optionalAdminDb() {
	return createSupabaseAdmin();
}

export function adminDb() {
	const db = optionalAdminDb();
	if (!db) throw new Error('Fee service client unavailable: check the Supabase URL and server-side service key in the web deployment');
	return db;
}

/**
 * The event's owner and fee bearer.
 *
 * A database that has not applied `034_tiered_fee_engine.sql` has no
 * `events.fee_bearer` column. That must not blank every fee breakdown, so the
 * lookup retries with the owner alone and reports `fee_bearer: null`; the
 * caller then keeps the bearer the page already rendered. (Checkout still
 * needs the migration — the pricing RPC reads the same column.)
 */
export async function getEventForFee(cookies: Cookies, id: string) {
	const db = createSupabase(cookies);
	if (!db) throw new Error('Database is not configured');
	const { data, error } = await db.from('events').select('organizer_id,fee_bearer').eq('id', id).maybeSingle();
	if (!error) return data;
	if (error.code !== '42703' && !/fee_bearer/i.test(error.message ?? '')) {
		throw new Error(`Event fee lookup failed (${error.code}): ${error.message}`);
	}
	console.warn('events.fee_bearer is missing; quoting with the fee bearer shown on the page', { code: error.code });
	const retry = await db.from('events').select('organizer_id').eq('id', id).maybeSingle();
	if (retry.error) throw new Error(`Event fee lookup failed (${retry.error.code}): ${retry.error.message}`);
	return retry.data ? { ...retry.data, fee_bearer: null } : null;
}

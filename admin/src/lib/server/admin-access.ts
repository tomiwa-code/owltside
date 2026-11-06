import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole, AdminSession, AdminStaff, AdminTier, DbAdminRole } from '$admin/types';
import { createAdminClient, isUserRecordBlocked } from './supabase-data';
import { logAudit } from './store';

export interface AdminAccess {
	userId: string;
	handle: string;
	name: string;
	email?: string;
	dbRole: DbAdminRole;
	role: AdminRole;
	tier: AdminTier;
}

export interface AssignableUser {
	id: string;
	handle: string;
	name: string;
	email: string;
}

export class AdminSchemaError extends Error {
	constructor(
		message = 'Database column public.profiles.role is missing. Run supabase/sql/032_profile_admin_roles.sql in Supabase SQL Editor and set your profile role to superadmin.'
	) {
		super(message);
		this.name = 'AdminSchemaError';
	}
}

export class AdminAccessMutationError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.name = 'AdminAccessMutationError';
		this.status = status;
	}
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Normalize DB role values ('superadmin', 'super admin', 'super_admin', 'admin') to canonical DbAdminRole. */
export function parseDbAdminRole(raw: unknown): DbAdminRole | null {
	if (typeof raw !== 'string') return null;
	const compact = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
	if (compact === 'superadmin') return 'superadmin';
	if (compact === 'admin') return 'admin';
	return null;
}

export function parseTargetAdminRole(raw: unknown): DbAdminRole | null {
	return parseDbAdminRole(raw);
}

export function roleToDisplay(dbRole: DbAdminRole): { role: AdminRole; tier: AdminTier } {
	if (dbRole === 'superadmin') return { role: 'Super Admin', tier: 0 };
	return { role: 'Admin', tier: 1 };
}

function isMissingRoleColumn(err: { code?: string; message?: string } | null | undefined): boolean {
	if (!err) return false;
	return err.code === '42703' || /column .*role.* does not exist/i.test(err.message ?? '');
}

function describeAuthMethod(authUser?: Record<string, any>): string {
	const providers = new Set<string>();
	const appProviders = authUser?.app_metadata?.providers;
	if (Array.isArray(appProviders)) {
		for (const p of appProviders) if (typeof p === 'string') providers.add(p.toLowerCase());
	}
	if (typeof authUser?.app_metadata?.provider === 'string') {
		providers.add(authUser.app_metadata.provider.toLowerCase());
	}
	if (Array.isArray(authUser?.identities)) {
		for (const identity of authUser.identities) {
			if (typeof identity?.provider === 'string') providers.add(identity.provider.toLowerCase());
		}
	}
	const hasGoogle = providers.has('google');
	const hasEmail = providers.has('email') || Boolean(authUser?.email);
	if (hasGoogle && hasEmail) return 'Google + Email OTP';
	if (hasGoogle) return 'Google OAuth';
	return 'Email OTP';
}

async function listAllAuthUsers(client: SupabaseClient): Promise<Map<string, Record<string, any>>> {
	const map = new Map<string, Record<string, any>>();
	const perPage = 1000;
	for (let page = 1; ; page += 1) {
		const { data, error } = await client.auth.admin.listUsers({ page, perPage });
		if (error) throw new Error(`Supabase Auth user lookup failed: ${error.message}`);
		for (const user of data.users as Record<string, any>[]) {
			map.set(String(user.id), user);
		}
		if (data.users.length < perPage) break;
	}
	return map;
}

/** Fast per-request permission check against public.profiles. Fails closed on error. */
export async function getAdminAccess(userId: string): Promise<AdminAccess | null> {
	if (!userId || !UUID_RE.test(userId)) return null;
	const client = createAdminClient();
	const { data, error } = await client
		.from('profiles')
		.select('id, handle, name, role, disabled')
		.eq('id', userId)
		.maybeSingle();

	if (isMissingRoleColumn(error)) throw new AdminSchemaError();
	if (error) throw new Error(`Admin access lookup failed: ${error.message}`);
	if (!data || data.disabled === true) return null;

	const dbRole = parseDbAdminRole(data.role);
	if (!dbRole) return null;

	const display = roleToDisplay(dbRole);
	const name = String(data.name ?? '').trim() || String(data.handle ?? '').trim() || 'Administrator';
	return {
		userId: String(data.id),
		handle: String(data.handle ?? ''),
		name,
		dbRole,
		role: display.role,
		tier: display.tier
	};
}

export type AdminIdentityLookup =
	| { status: 'ok'; access: AdminAccess; email: string }
	| { status: 'disabled'; reason: string }
	| { status: 'denied' };

/** Full sign-in authorization check (profiles.role + Auth account status) after OTP or OAuth. */
export async function lookupAdminByUserId(userId: string, knownEmail?: string | null): Promise<AdminIdentityLookup> {
	if (!userId || !UUID_RE.test(userId)) return { status: 'denied' };
	const client = createAdminClient();

	const [profileRes, authRes] = await Promise.all([
		client
			.from('profiles')
			.select('id, handle, name, role, disabled, disabled_reason')
			.eq('id', userId)
			.maybeSingle(),
		client.auth.admin.getUserById(userId)
	]);

	if (isMissingRoleColumn(profileRes.error)) throw new AdminSchemaError();
	if (profileRes.error) throw new Error(`Admin profile lookup failed: ${profileRes.error.message}`);

	const profile = profileRes.data as Record<string, any> | null;
	const authUser = authRes.data?.user as Record<string, any> | undefined;
	if (!profile) return { status: 'denied' };

	const dbRole = parseDbAdminRole(profile.role);
	if (!dbRole) return { status: 'denied' };

	if (isUserRecordBlocked(profile, authUser)) {
		const meta = (authUser?.user_metadata ?? {}) as Record<string, any>;
		const reason =
			(typeof profile.disabled_reason === 'string' && profile.disabled_reason) ||
			(typeof meta.disabled_reason === 'string' && meta.disabled_reason) ||
			'This administrator account has been disabled.';
		return { status: 'disabled', reason };
	}

	const email = String(authUser?.email ?? knownEmail ?? '').trim().toLowerCase();
	if (!email) return { status: 'denied' };

	const display = roleToDisplay(dbRole);
	const name = String(profile.name ?? '').trim() || String(profile.handle ?? '').trim() || email.split('@')[0];
	return {
		status: 'ok',
		email,
		access: {
			userId: String(profile.id),
			handle: String(profile.handle ?? ''),
			name,
			email,
			dbRole,
			role: display.role,
			tier: display.tier
		}
	};
}

/** Pre-flight email check before dispatching a 6-digit OTP so non-admins are rejected immediately. */
export async function findAdminByEmail(rawEmail: string): Promise<AdminIdentityLookup> {
	const email = rawEmail.trim().toLowerCase();
	if (!EMAIL_RE.test(email)) return { status: 'denied' };

	const client = createAdminClient();
	const { data: adminProfiles, error } = await client
		.from('profiles')
		.select('id, handle, name, role, disabled, disabled_reason')
		.neq('role', 'user');

	if (isMissingRoleColumn(error)) throw new AdminSchemaError();
	if (error) throw new Error(`Admin directory lookup failed: ${error.message}`);

	const candidates = (adminProfiles ?? []).filter((row) => parseDbAdminRole(row.role) !== null);
	if (candidates.length === 0) return { status: 'denied' };

	let matchedProfile: Record<string, any> | undefined;
	let matchedAuth: Record<string, any> | undefined;

	if (candidates.length <= 25) {
		const lookups = await Promise.all(
			candidates.map(async (profile) => {
				const res = await client.auth.admin.getUserById(String(profile.id));
				return { profile, user: res.data?.user as Record<string, any> | undefined };
			})
		);
		const hit = lookups.find((entry) => String(entry.user?.email ?? '').trim().toLowerCase() === email);
		matchedProfile = hit?.profile;
		matchedAuth = hit?.user;
	} else {
		const authById = await listAllAuthUsers(client);
		for (const profile of candidates) {
			const user = authById.get(String(profile.id));
			if (String(user?.email ?? '').trim().toLowerCase() === email) {
				matchedProfile = profile;
				matchedAuth = user;
				break;
			}
		}
	}

	if (!matchedProfile || !matchedAuth) return { status: 'denied' };

	const dbRole = parseDbAdminRole(matchedProfile.role);
	if (!dbRole) return { status: 'denied' };

	if (isUserRecordBlocked(matchedProfile, matchedAuth)) {
		const meta = (matchedAuth.user_metadata ?? {}) as Record<string, any>;
		const reason =
			(typeof matchedProfile.disabled_reason === 'string' && matchedProfile.disabled_reason) ||
			(typeof meta.disabled_reason === 'string' && meta.disabled_reason) ||
			'This administrator account has been disabled.';
		return { status: 'disabled', reason };
	}

	const display = roleToDisplay(dbRole);
	const name =
		String(matchedProfile.name ?? '').trim() ||
		String(matchedProfile.handle ?? '').trim() ||
		email.split('@')[0];

	return {
		status: 'ok',
		email,
		access: {
			userId: String(matchedProfile.id),
			handle: String(matchedProfile.handle ?? ''),
			name,
			email,
			dbRole,
			role: display.role,
			tier: display.tier
		}
	};
}

function mapAdminStaff(profile: Record<string, any>, authUser?: Record<string, any>): AdminStaff | null {
	const dbRole = parseDbAdminRole(profile.role);
	if (!dbRole) return null;
	const display = roleToDisplay(dbRole);
	const blocked = isUserRecordBlocked(profile, authUser);
	const email = String(authUser?.email ?? '').trim().toLowerCase();
	const createdAt = String(profile.created_at ?? authUser?.created_at ?? new Date(0).toISOString());
	const lastActive = String(authUser?.last_sign_in_at ?? '');
	return {
		id: String(profile.id),
		handle: String(profile.handle ?? profile.id).trim(),
		name: String(profile.name ?? profile.handle ?? (email || 'Administrator')).trim(),
		email,
		role: display.role,
		dbRole,
		tier: display.tier,
		auth: describeAuthMethod(authUser),
		status: blocked ? 'suspended' : 'active',
		createdAt,
		lastActive,
		city: String(profile.city ?? '').trim() || '—'
	};
}

/** Load real administrators and assignable regular users from Supabase. */
export async function listAdminRoster(): Promise<{
	staff: AdminStaff[];
	candidates: AssignableUser[];
	totalUsers: number;
}> {
	const client = createAdminClient();
	const [{ data: profiles, error }, authById] = await Promise.all([
		client
			.from('profiles')
			.select('id, handle, name, role, city, disabled, created_at')
			.order('created_at', { ascending: false }),
		listAllAuthUsers(client).catch(() => new Map<string, Record<string, any>>())
	]);

	if (isMissingRoleColumn(error)) throw new AdminSchemaError();
	if (error) throw new Error(`Failed to load administrators: ${error.message}`);

	const rows = (profiles ?? []) as Record<string, any>[];
	const staff: AdminStaff[] = [];
	const candidates: AssignableUser[] = [];

	for (const row of rows) {
		const authUser = authById.get(String(row.id));
		const adminItem = mapAdminStaff(row, authUser);
		if (adminItem) {
			staff.push(adminItem);
		} else if (!isUserRecordBlocked(row, authUser)) {
			const email = String(authUser?.email ?? '').trim().toLowerCase();
			if (email && candidates.length < 250) {
				candidates.push({
					id: String(row.id),
					handle: String(row.handle ?? ''),
					name: String(row.name ?? row.handle ?? email.split('@')[0]),
					email
				});
			}
		}
	}

	staff.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
	return {
		staff,
		candidates,
		totalUsers: rows.length
	};
}

export async function listAdminStaff(): Promise<AdminStaff[]> {
	const { staff } = await listAdminRoster();
	return staff;
}

async function resolveUniqueHandle(client: SupabaseClient, rawBase: string, userId: string): Promise<string> {
	const cleaned = rawBase
		.replace(/^@/, '')
		.replace(/[^a-z0-9_]/gi, '')
		.toLowerCase()
		.slice(0, 18);
	const base = cleaned.length >= 3 ? cleaned : `owl_${userId.slice(0, 6).toLowerCase()}`;
	const { data: clash } = await client
		.from('profiles')
		.select('id')
		.eq('handle', base)
		.neq('id', userId)
		.maybeSingle();
	return clash ? `${base}_${userId.slice(0, 5).toLowerCase()}` : base;
}

/**
 * Assign 'admin' or 'superadmin' role to an existing user (by userId or email)
 * OR create a confirmed Owltside account for a new email so the same login works
 * on both the main app and the admin dashboard.
 */
export async function assignAdminRole(
	input: { userId?: string; email?: string; name?: string; role?: unknown },
	actor: AdminSession
): Promise<AdminStaff> {
	const targetRole = parseTargetAdminRole(input.role ?? 'admin');
	if (!targetRole) {
		throw new AdminAccessMutationError('Select a valid role (Admin or Super Admin).', 400);
	}

	const client = createAdminClient();
	const rawUserId = input.userId?.trim() ?? '';
	const normalizedEmail = (input.email ?? '').trim().toLowerCase();
	const requestedName = (input.name ?? '').trim();

	let targetUser: Record<string, any> | undefined;
	let createdNewAccount = false;

	if (rawUserId) {
		if (!UUID_RE.test(rawUserId)) {
			throw new AdminAccessMutationError('Invalid user ID.', 400);
		}
		const { data, error } = await client.auth.admin.getUserById(rawUserId);
		if (error || !data?.user) {
			throw new AdminAccessMutationError('Selected user account was not found.', 404);
		}
		targetUser = data.user as Record<string, any>;
	} else {
		if (!EMAIL_RE.test(normalizedEmail)) {
			throw new AdminAccessMutationError('Enter a valid email address.', 400);
		}
		const authById = await listAllAuthUsers(client);
		for (const candidate of authById.values()) {
			if (String(candidate.email ?? '').trim().toLowerCase() === normalizedEmail) {
				targetUser = candidate;
				break;
			}
		}

		if (!targetUser) {
			const displayName = requestedName || normalizedEmail.split('@')[0];
			const { data: created, error: createError } = await client.auth.admin.createUser({
				email: normalizedEmail,
				email_confirm: true,
				user_metadata: { full_name: displayName }
			});
			if (createError || !created?.user) {
				throw new AdminAccessMutationError(
					createError?.message ?? 'Could not create the new user account in Supabase Auth.',
					400
				);
			}
			targetUser = created.user as Record<string, any>;
			createdNewAccount = true;
		}
	}

	const userId = String(targetUser.id);
	const userEmail = String(targetUser.email ?? normalizedEmail).trim().toLowerCase();

	const { data: existingProfile, error: profileErr } = await client
		.from('profiles')
		.select('id, handle, name, role, city, disabled, created_at')
		.eq('id', userId)
		.maybeSingle();

	if (isMissingRoleColumn(profileErr)) throw new AdminSchemaError();
	if (profileErr) throw new Error(`Profile lookup failed: ${profileErr.message}`);

	if (actor.userId && userId === actor.userId && targetRole !== 'superadmin') {
		throw new AdminAccessMutationError('You cannot demote your own Super Admin account.', 409);
	}

	const previousRole = String(existingProfile?.role ?? 'user');
	let updatedProfile: Record<string, any> | null = null;

	if (existingProfile) {
		const patch: Record<string, any> = {
			role: targetRole,
			disabled: false,
			disabled_reason: null,
			disabled_at: null
		};
		if (requestedName && !String(existingProfile.name ?? '').trim()) {
			patch.name = requestedName;
		}
		const { data, error } = await client
			.from('profiles')
			.update(patch)
			.eq('id', userId)
			.select('id, handle, name, role, city, disabled, created_at')
			.single();
		if (isMissingRoleColumn(error)) throw new AdminSchemaError();
		if (error) throw new Error(`Failed to assign role: ${error.message}`);
		updatedProfile = data as Record<string, any>;
	} else {
		const displayName =
			requestedName ||
			String(targetUser.user_metadata?.full_name ?? targetUser.user_metadata?.name ?? '').trim() ||
			userEmail.split('@')[0] ||
			'Administrator';
		const handle = await resolveUniqueHandle(client, userEmail.split('@')[0] || displayName, userId);
		const { data, error } = await client
			.from('profiles')
			.upsert(
				{
					id: userId,
					handle,
					name: displayName,
					role: targetRole,
					disabled: false,
					disabled_reason: null,
					disabled_at: null
				},
				{ onConflict: 'id' }
			)
			.select('id, handle, name, role, city, disabled, created_at')
			.single();
		if (isMissingRoleColumn(error)) throw new AdminSchemaError();
		if (error) throw new Error(`Failed to create admin profile: ${error.message}`);
		updatedProfile = data as Record<string, any>;
	}

	const staff = mapAdminStaff(updatedProfile, targetUser);
	if (!staff) {
		throw new Error('Role assignment completed, but the administrator record could not be mapped.');
	}

	logAudit({
		actor: actor.name,
		actorRole: actor.role,
		action: createdNewAccount ? 'ADMIN_USER_PROVISIONED' : 'ADMIN_ROLE_ASSIGNED',
		kind: 'staff',
		entityId: staff.id,
		target: `${staff.name} · ${staff.email}`,
		reason: createdNewAccount
			? `Created Owltside account and assigned ${staff.role}`
			: `Assigned ${staff.role} role`,
		severity: targetRole === 'superadmin' ? 'warning' : 'info',
		diff: [{ field: 'role', before: previousRole, after: targetRole }]
	});

	return staff;
}

/**
 * Update an existing administrator's role ('admin' | 'superadmin') or remove their
 * admin access ('user') while preserving at least one active Super Admin.
 */
export async function updateAdminRoleOrAccess(
	targetUserId: string,
	input: { role: 'superadmin' | 'admin' | 'user'; reason?: string },
	actor: AdminSession
): Promise<{ id: string; role: 'superadmin' | 'admin' | 'user' }> {
	if (!UUID_RE.test(targetUserId)) {
		throw new AdminAccessMutationError('Invalid administrator ID.', 400);
	}
	if (!['superadmin', 'admin', 'user'].includes(input.role)) {
		throw new AdminAccessMutationError('Invalid role value.', 400);
	}
	if (actor.userId && targetUserId === actor.userId && input.role !== 'superadmin') {
		throw new AdminAccessMutationError('You cannot revoke or demote your own Super Admin account.', 409);
	}

	const client = createAdminClient();
	const { data: current, error: fetchErr } = await client
		.from('profiles')
		.select('id, handle, name, role, disabled')
		.eq('id', targetUserId)
		.maybeSingle();

	if (isMissingRoleColumn(fetchErr)) throw new AdminSchemaError();
	if (fetchErr) throw new Error(`Administrator lookup failed: ${fetchErr.message}`);
	if (!current) throw new AdminAccessMutationError('Administrator not found.', 404);

	const previousDbRole = parseDbAdminRole(current.role);
	if (!previousDbRole && input.role === 'user') {
		throw new AdminAccessMutationError('User does not currently hold an administrator role.', 404);
	}

	if (previousDbRole === 'superadmin' && input.role !== 'superadmin') {
		const { data: superRows, error: superErr } = await client
			.from('profiles')
			.select('id, role, disabled')
			.neq('role', 'user');
		if (superErr) throw new Error(`Super Admin check failed: ${superErr.message}`);
		const activeSuperCount = (superRows ?? []).filter(
			(row) => parseDbAdminRole(row.role) === 'superadmin' && row.disabled !== true && String(row.id) !== targetUserId
		).length;
		if (activeSuperCount < 1) {
			throw new AdminAccessMutationError('At least one active Super Admin must remain on the platform.', 409);
		}
	}

	const { error: updateErr } = await client
		.from('profiles')
		.update({ role: input.role })
		.eq('id', targetUserId);

	if (isMissingRoleColumn(updateErr)) throw new AdminSchemaError();
	if (updateErr) throw new Error(`Failed to update administrator role: ${updateErr.message}`);

	const authRes = await client.auth.admin.getUserById(targetUserId).catch(() => null);
	const email = String(authRes?.data?.user?.email ?? '').trim().toLowerCase();
	const label = `${String(current.name ?? current.handle ?? targetUserId)}${email ? ` · ${email}` : ''}`;

	logAudit({
		actor: actor.name,
		actorRole: actor.role,
		action: input.role === 'user' ? 'ADMIN_ROLE_REVOKED' : 'ADMIN_ROLE_UPDATED',
		kind: 'staff',
		entityId: targetUserId,
		target: label,
		reason:
			input.reason?.trim() ||
			(input.role === 'user'
				? 'Removed administrator access'
				: `Updated administrator role to ${input.role}`),
		severity: input.role === 'user' ? 'critical' : 'warning',
		diff: [{ field: 'role', before: String(current.role ?? 'user'), after: input.role }]
	});

	return { id: targetUserId, role: input.role };
}

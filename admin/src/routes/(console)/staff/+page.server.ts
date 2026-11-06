import type { PageServerLoad } from './$types';
import { listAdminRoster } from '$admin/server/admin-access';
import { auditStream, countAudit } from '$admin/server/store';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const roster = await listAdminRoster();
		const staff = roster.staff;
		const activeCount = staff.filter((member) => member.status === 'active').length;
		const audit = countAudit(activeCount);

		return {
			staff,
			candidates: roster.candidates,
			error: null as string | null,
			isSuperAdmin: Boolean(locals.admin && locals.admin.tier === 0),
			currentUserId: locals.admin?.userId ?? null,
			telemetry: auditStream(),
			counts: {
				total: staff.length,
				active: activeCount,
				suspended: staff.filter((member) => member.status === 'suspended').length,
				superAdmins: staff.filter((member) => member.dbRole === 'superadmin').length,
				admins: staff.filter((member) => member.dbRole === 'admin').length,
				regularUsers: Math.max(0, roster.totalUsers - staff.length),
				critical: audit.critical
			}
		};
	} catch (cause) {
		const audit = countAudit(0);
		return {
			staff: [],
			candidates: [],
			error:
				cause instanceof Error
					? cause.message
					: 'Unable to load administrators from Supabase.',
			isSuperAdmin: Boolean(locals.admin && locals.admin.tier === 0),
			currentUserId: locals.admin?.userId ?? null,
			telemetry: auditStream(),
			counts: {
				total: 0,
				active: 0,
				suspended: 0,
				superAdmins: 0,
				admins: 0,
				regularUsers: 0,
				critical: audit.critical
			}
		};
	}
};

// @ts-nocheck
import type { PageServerLoad } from './$types';
import { auditStream, countAudit, listStaff } from '$admin/server/store';

export const load = () => {
	const staff = listStaff();
	const audit = countAudit();
	return {
		staff,
		telemetry: auditStream(),
		counts: {
			total: staff.length,
			active: staff.filter((member) => member.status === 'active').length,
			invited: staff.filter((member) => member.status === 'invited').length,
			suspended: staff.filter((member) => member.status === 'suspended').length,
			tier0: staff.filter((member) => member.tier === 0).length,
			hardware: staff.filter((member) => member.auth === 'FIDO2 WebAuthn').length,
			sessions: staff.reduce((sum, member) => sum + member.sessions, 0),
			elevated: 38,
			critical: audit.critical
		}
	};
};
;null as any as PageServerLoad;
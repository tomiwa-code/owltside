import type { PageServerLoad } from './$types';
import type { AdminOrder, AdminTicket, AdminUser, AuditRecord } from '$admin/types';
import { listSupabaseUsers } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminUser['status'] | 'all';
	const role = url.searchParams.get('role') ?? 'all';
	const kyc = url.searchParams.get('kyc') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requested = url.searchParams.get('user');

	try {
		const live = await listSupabaseUsers({ q, status, role, kyc, page, perPage: 10 }, requested ?? undefined);
		return {
			table: { rows: live.page.rows, total: live.page.total, page: live.page.page, pages: live.page.pages, perPage: live.page.perPage },
			filters: { q, status, role, kyc },
			counts: live.counts,
			selectedId: live.selected?.id ?? null,
			selected: live.selected,
			related: live.related,
			error: '',
			source: 'supabase' as const
		};
	} catch (cause) {
		const error = cause instanceof Error ? cause.message : 'The user directory could not be loaded.';
		return {
			table: { rows: [] as AdminUser[], total: 0, page: 1, pages: 1, perPage: 10 },
			filters: { q, status, role, kyc },
			counts: { total: 0, active: 0, flagged: 0, blocked: 0, verifiedOrganizers: 0 },
			selectedId: null as string | null,
			selected: null as AdminUser | null,
			related: {
				tickets: [] as AdminTicket[],
				orders: [] as AdminOrder[],
				audit: [] as AuditRecord[]
			},
			error,
			source: 'unavailable' as const
		};
	}
};

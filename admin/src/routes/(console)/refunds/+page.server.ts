import type { PageServerLoad } from './$types';
import { getRefund, getRefundsData } from '$admin/server/store';

export const load: PageServerLoad = ({ url }) => {
	const refund = getRefundsData();
	const requested = url.searchParams.get('refund');
	const selected =
		refund.rows.find((item) => item.id === requested || item.orderRef === requested) ??
		refund.rows.find((item) => item.status === 'pending') ??
		refund.rows[0] ??
		null;
	return {
		refunds: refund,
		selected,
		selectedId: selected?.id ?? null,
		eligible: refund.rows.filter((item) => item.status === 'pending' && item.policyMatch >= 90).length,
		recent: getRefund('rfd-071')
	};
};

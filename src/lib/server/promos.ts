export const PROMOS: Record<string, { kind: 'flat' | 'pct'; value: number }> = {
	TECHCOMMUNITY: { kind: 'flat', value: 5000 },
	OWL10: { kind: 'pct', value: 10 }
};

export function computeTotals(price: number, qty: number, promo: string | null) {
	const base = price * qty;
	const fee = base > 0 ? Math.min(Math.round(base * 0.015), 1000) : 0;
	let discount = 0;
	if (promo && PROMOS[promo]) {
		const p = PROMOS[promo];
		discount = p.kind === 'flat' ? Math.min(p.value, base) : Math.round((base * p.value) / 100);
	}
	return { base, fee, discount, total: Math.max(0, base + fee - discount) };
}

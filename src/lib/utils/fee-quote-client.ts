export interface ClientFeeQuote {
	ticketPriceKobo: number;
	platformFeeKobo: number;
	processingFeeKobo: number;
	buyerTotalKobo: number;
	organizerNetKobo: number;
	feeBearer: 'ABSORB' | 'PASS';
	processingFeeBearer: 'ABSORB' | 'PASS';
	appliedRuleName: string | null;
}

export async function requestFeeQuote(input: {
	ticketPriceKobo: number; quantity: number; feeBearer?: 'ABSORB' | 'PASS'; eventId?: string;
}): Promise<{ unit: ClientFeeQuote; totals: Omit<ClientFeeQuote, 'feeBearer' | 'appliedRuleName'> }> {
	const response = await fetch('/api/v1/fees/quote', {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(typeof body?.error === 'string' ? body.error : 'Fees could not be loaded');
	}
	return response.json();
}

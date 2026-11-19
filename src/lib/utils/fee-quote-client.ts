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

export interface FeeQuoteInput {
	ticketPriceKobo: number; quantity: number; feeBearer?: 'ABSORB' | 'PASS'; eventId?: string;
}

export interface FeeQuoteResponse {
	unit: ClientFeeQuote;
	totals: Omit<ClientFeeQuote, 'feeBearer' | 'appliedRuleName'>;
}

/** A quote request that reached the server and was rejected (or could not be read). */
export class FeeQuoteError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = 'FeeQuoteError';
	}
}

const RETRY_DELAY_MS = 400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 5xx/429 mean "try again"; 4xx means the request itself was wrong. */
const isRetryable = (error: unknown) =>
	error instanceof FeeQuoteError ? error.status >= 500 || error.status === 429 : true;

async function requestOnce(input: FeeQuoteInput): Promise<FeeQuoteResponse> {
	const response = await fetch('/api/v1/fees/quote', {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new FeeQuoteError(typeof body?.error === 'string' ? body.error : 'Fees could not be loaded', response.status);
	}
	return response.json();
}

/**
 * Ask the server for a quote. A cold serverless function or a transient
 * upstream hiccup gets one automatic retry — otherwise the buyer is left
 * staring at "Service fee: Unavailable" until they reload the page.
 */
export async function requestFeeQuote(input: FeeQuoteInput): Promise<FeeQuoteResponse> {
	try {
		return await requestOnce(input);
	} catch (error) {
		if (!isRetryable(error)) throw error;
		await wait(RETRY_DELAY_MS);
		return requestOnce(input);
	}
}

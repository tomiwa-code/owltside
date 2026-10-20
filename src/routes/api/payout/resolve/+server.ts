import { json } from '@sveltejs/kit';
import { resolveBankAccountName, paystackSecretConfigured } from '$lib/server/paystack';
import { PAYOUT_BANKS, isValidNuban, normaliseNuban, resolveAccountName } from '$lib/utils/payout';
import type { RequestHandler } from './$types';

/**
 * Name enquiry for a payout account.
 *
 * The account name has to come from the account, never from the signed-in
 * user: the same bank + account number always returns the same holder, and a
 * different number returns a different holder.
 *
 * With `PAYSTACK_SECRET_KEY` configured (and a known bank code) this asks the
 * live register. Without a key — or for a bank Paystack has no code for — it
 * answers from the simulated directory and says so, so the UI can label it
 * instead of pretending it is NIBSS.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session) return json({ error: 'Sign in to look up a payout account.' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const bank = String(body?.bank ?? '').trim();
	const accountNumber = normaliseNuban(String(body?.accountNumber ?? ''));

	if (!(PAYOUT_BANKS as readonly string[]).includes(bank)) {
		return json({ error: 'Choose one of the supported banks.' }, { status: 400 });
	}
	if (!isValidNuban(accountNumber)) {
		return json({ error: 'Enter a valid 10-digit NUBAN account number.' }, { status: 400 });
	}

	if (paystackSecretConfigured()) {
		try {
			const accountName = await resolveBankAccountName(bank, accountNumber);
			return json(
				{ ok: true, accountName, simulated: false },
				{ headers: { 'cache-control': 'no-store' } }
			);
		} catch (error) {
			// Never fall back to a made-up name when a live provider is
			// configured: a wrong holder is worse than an error.
			return json(
				{
					error:
						error instanceof Error
							? error.message
							: 'The bank could not confirm that account. Check the number and bank.'
				},
				{ status: 502 }
			);
		}
	}

	const accountName = resolveAccountName(bank, accountNumber);
	if (!accountName) {
		return json({ error: 'That account could not be resolved. Check the number and bank.' }, { status: 404 });
	}
	return json(
		{ ok: true, accountName, simulated: true },
		{ headers: { 'cache-control': 'no-store' } }
	);
};

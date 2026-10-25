import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import { maskAccountNumber, normaliseNuban } from '$lib/utils/payout';
import type { CreateApprovalInput } from '$lib/types';
import type { RequestHandler } from './$types';

/** Everything the public app may submit for admin review. */
const VERIFICATION_CHECKS = new Set(['identity', 'payoutAccount']);

const text = (value: unknown, max = 200): string =>
	typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Turn a client submission into a reviewable request. Titles and summaries are
 * built here (never trusted from the client) so the admin queue always reads
 * the same way, and `payload` is trimmed down to review-relevant fields.
 */
function buildApproval(body: Record<string, unknown>): CreateApprovalInput | string {
	const kind = text(body.kind, 20);

	if (kind === 'verification') {
		const check = text(body.check, 40);
		if (!VERIFICATION_CHECKS.has(check)) return 'Choose a verification to submit.';
		const details = (body.details ?? {}) as Record<string, unknown>;

		if (check === 'identity') {
			const document = text(details.document, 60) || 'NIN';
			const digits = text(details.reference, 20).replace(/\s/g, '');
			// Only the last four digits are persisted: the reviewer needs to match
			// the document, never to store the full ID number.
			const reference = digits.slice(-4);
			return {
				kind: 'verification',
				title: 'Identity verification',
				summary: `${document} document submitted for review${reference ? ` • ending ${reference}` : ''}`,
				subjectLabel: 'identity',
				payload: { check, document, reference }
			};
		}

		const bank = text(details.bank, 60);
		const accountNumber = normaliseNuban(text(details.accountNumber, 20));
		if (!bank) return 'Choose your bank before submitting your payout account.';
		if (!/^\d{10}$/.test(accountNumber)) return 'Enter a valid 10-digit NUBAN account number.';
		return {
			kind: 'verification',
			title: 'Payout account verification',
			summary: `${bank} ${maskAccountNumber(accountNumber)} submitted for review`,
			subjectLabel: bank,
			payload: { check, bank, accountNumber }
		};
	}

	if (kind === 'payout') {
		const eventId = text(body.subjectId, 60);
		const eventTitle = text(body.subjectLabel, 120) || 'Settlement balance';
		const amount = Number(body.amount);
		if (!Number.isFinite(amount) || amount <= 0) return 'There is no cleared balance to pay out yet.';
		const destination = text(body.destination, 80);
		return {
			kind: 'payout',
			title: `Instant payout · ${eventTitle}`,
			summary: `Cleared settlement balance requested${destination ? ` to ${destination}` : ''}`,
			amount,
			subjectId: eventId || undefined,
			subjectLabel: eventTitle,
			payload: { eventId, destination }
		};
	}

	return 'That request type cannot be submitted from here.';
}

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const approvals = await getSource(createSupabase(cookies)).listApprovals(
		locals.session?.userId ?? 'demo'
	);
	return json(approvals, { headers: { 'cache-control': 'private, max-age=0, no-store' } });
};

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const input = buildApproval(body);
	if (typeof input === 'string') return json({ error: input }, { status: 400 });

	try {
		const approval = await getSource(createSupabase(cookies)).createApproval(
			locals.session?.userId ?? 'demo',
			input
		);
		return json(approval, { status: 201, headers: { 'cache-control': 'no-store' } });
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'Your request could not be submitted. Please try again.';
		return json({ error: message }, { status: 400 });
	}
};

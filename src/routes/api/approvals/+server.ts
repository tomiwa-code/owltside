import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import { maskAccountNumber, normaliseNuban } from '$lib/utils/payout';
import type { ApprovalRequest, CreateApprovalInput, Session } from '$lib/types';
import type { RequestHandler } from './$types';

/** Everything the public app may submit for admin review. */
const VERIFICATION_CHECKS = new Set(['identity', 'payoutAccount', 'phone']);

const text = (value: unknown, max = 200): string =>
	typeof value === 'string' ? value.trim().slice(0, max) : '';

const MAX_DOC_URL_LENGTH = 7_500_000;

function sanitizeDocMedia(
	raw: unknown
): { name: string; dataUrl: string | null; mimeType: string } | null {
	if (!raw || typeof raw !== 'object') return null;
	const rec = raw as Record<string, unknown>;
	const name = text(rec.name, 160) || 'document';
	const mimeType = text(rec.mimeType, 80) || 'image/jpeg';
	const preview =
		typeof rec.dataUrl === 'string'
			? rec.dataUrl.trim()
			: typeof rec.preview === 'string'
				? rec.preview.trim()
				: '';
	if (
		preview &&
		preview.length <= MAX_DOC_URL_LENGTH &&
		/^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i.test(preview)
	) {
		return { name, dataUrl: preview, mimeType };
	}
	return { name, dataUrl: null, mimeType };
}

/**
 * Redact raw KYC media and full government ID numbers from public browser responses
 * while keeping the unredacted payload intact inside `approval_requests` for Admin.
 */
function redactForPublicClient(approval: ApprovalRequest): ApprovalRequest {
	const rawPayload = (approval.payload ?? {}) as Record<string, unknown>;
	const sanitized: Record<string, unknown> = { ...rawPayload };
	delete sanitized.fullReference;
	if (sanitized.frontDocument && typeof sanitized.frontDocument === 'object') {
		const doc = sanitized.frontDocument as { name?: string; mimeType?: string };
		sanitized.frontDocument = { name: doc.name ?? 'front', uploaded: true };
	}
	if (sanitized.backDocument && typeof sanitized.backDocument === 'object') {
		const doc = sanitized.backDocument as { name?: string; mimeType?: string };
		sanitized.backDocument = { name: doc.name ?? 'back', uploaded: true };
	}
	return { ...approval, payload: sanitized };
}

/**
 * Turn a client submission into a reviewable request. Titles and summaries are
 * built here (never trusted from the client) so the admin queue always reads
 * the same way, while full unredacted fields are stored in `payload` for Admin.
 */
function buildApproval(
	body: Record<string, unknown>,
	session: Session | null
): CreateApprovalInput | string {
	const kind = text(body.kind, 20);
	const requesterMeta = session
		? {
				requesterName: session.name,
				requesterHandle: session.handle,
				requesterEmail: session.email
			}
		: {};

	if (kind === 'verification') {
		const check = text(body.check, 40);
		if (!VERIFICATION_CHECKS.has(check)) return 'Choose a verification to submit.';
		const details = (body.details ?? {}) as Record<string, unknown>;

		if (check === 'identity') {
			const document = text(details.document, 60) || 'NIN';
			const fullReference = text(details.reference, 40).replace(/\s/g, '');
			const reference = fullReference.slice(-4);
			const legalName = text(details.legalName, 120) || session?.name || '';
			const dateOfBirth = text(details.dateOfBirth, 24);
			const frontDocument = sanitizeDocMedia(details.frontDocument);
			const backDocument = sanitizeDocMedia(details.backDocument);
			const attachment =
				text(details.attachment, 40) ||
				(frontDocument && backDocument ? 'front+back' : frontDocument ? 'front' : undefined);

			return {
				kind: 'verification',
				title: 'Identity verification',
				summary: `${document} document submitted for review${reference ? ` • ending ${reference}` : ''}`,
				subjectLabel: 'identity',
				payload: {
					...requesterMeta,
					check,
					document,
					reference,
					fullReference,
					legalName: legalName || undefined,
					dateOfBirth: dateOfBirth || undefined,
					attachment,
					frontDocument,
					backDocument
				}
			};
		}

		if (check === 'phone') {
			const phone = text(details.phone, 24).replace(/\s/g, '');
			if (!/^\+234[789]\d{9}$/.test(phone)) {
				return 'Enter a valid Nigerian phone number starting with +234.';
			}
			return {
				kind: 'verification',
				title: 'Phone verification',
				summary: `Phone number ${phone} verified`,
				subjectLabel: phone,
				payload: {
					...requesterMeta,
					check: 'phone',
					phone
				}
			};
		}

		const bank = text(details.bank, 60);
		const accountNumber = normaliseNuban(text(details.accountNumber, 20));
		const accountHolder = text(details.accountHolder, 120) || session?.name || '';
		if (!bank) return 'Choose your bank before submitting your payout account.';
		if (!/^\d{10}$/.test(accountNumber)) return 'Enter a valid 10-digit NUBAN account number.';
		return {
			kind: 'verification',
			title: 'Payout account verification',
			summary: `${bank} ${maskAccountNumber(accountNumber)} submitted for review`,
			subjectLabel: bank,
			payload: {
				...requesterMeta,
				check,
				bank,
				accountNumber,
				accountHolder: accountHolder || undefined
			}
		};
	}

	if (kind === 'payout') {
		const eventId = text(body.subjectId, 60);
		const eventTitle = text(body.subjectLabel, 120) || 'Settlement balance';
		const amount = Number(body.amount);
		if (!Number.isFinite(amount) || amount <= 0) return 'There is no cleared balance to pay out yet.';
		const destination = text(body.destination, 80);
		const bank = text(body.bank, 60);
		const accountNumber = normaliseNuban(text(body.accountNumber, 20));
		const accountHolder = text(body.accountHolder, 120) || session?.name || '';
		return {
			kind: 'payout',
			title: `Instant payout · ${eventTitle}`,
			summary: `Cleared settlement balance requested${destination ? ` to ${destination}` : ''}`,
			amount,
			subjectId: eventId || undefined,
			subjectLabel: eventTitle,
			payload: {
				...requesterMeta,
				eventId,
				eventTitle,
				destination,
				bank: bank || undefined,
				accountNumber: accountNumber || undefined,
				accountHolder: accountHolder || undefined
			}
		};
	}

	return 'That request type cannot be submitted from here.';
}

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const approvals = await getSource(createSupabase(cookies)).listApprovals(
		locals.session?.userId ?? 'demo'
	);
	return json(approvals.map(redactForPublicClient), {
		headers: { 'cache-control': 'private, max-age=0, no-store' }
	});
};

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const input = buildApproval(body, locals.session);
	if (typeof input === 'string') return json({ error: input }, { status: 400 });

	const supabase = createSupabase(cookies);
	// Also mirror phone / bank / KYC metadata into auth user_metadata when signed in
	// so User & Organizer dossiers in Admin always have immediate access.
	if (supabase && locals.session && input.kind === 'verification') {
		const p = (input.payload ?? {}) as Record<string, unknown>;
		if (p.check === 'phone' && typeof p.phone === 'string') {
			await supabase.auth
				.updateUser({ data: { verified_phone: p.phone } })
				.then(() => undefined, () => undefined);
		} else if (p.check === 'payoutAccount') {
			await supabase.auth
				.updateUser({
					data: {
						payout_bank: p.bank,
						payout_account_number: p.accountNumber,
						payout_account_holder: p.accountHolder ?? locals.session.name
					}
				})
				.then(() => undefined, () => undefined);
		} else if (p.check === 'identity') {
			await supabase.auth
				.updateUser({
					data: {
						kyc_document: p.document,
						kyc_legal_name: p.legalName,
						kyc_dob: p.dateOfBirth,
						kyc_reference: p.fullReference
					}
				})
				.then(() => undefined, () => undefined);
		}
	}

	try {
		const approval = await getSource(supabase).createApproval(
			locals.session?.userId ?? 'demo',
			input
		);
		return json(redactForPublicClient(approval), {
			status: 201,
			headers: { 'cache-control': 'no-store' }
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'Your request could not be submitted. Please try again.';
		return json({ error: message }, { status: 400 });
	}
};

import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { clientKey } from '$lib/server/rate-limit';
import { CAPTCHA_FAILURE_MESSAGE, verifyCaptcha } from '$lib/server/captcha';
import { json } from '@sveltejs/kit';
import {
	isReportTargetType,
	isValidReportCategory,
	reportCategoryLabel
} from '$lib/constants/report-categories';
import type { RequestHandler } from './$types';

const clean = (value: unknown, max: number): string =>
	typeof value === 'string' ? value.trim().slice(0, max) : '';

const MIN_DETAILS = 10;
const MAX_DETAILS = 1000;

/**
 * Report an event listing or a public profile.
 *
 * The public app only ever files a report: it lands as `open` and is reviewed in
 * the admin console. Guests may report too (reporter_id stays null), but a
 * duplicate open report for the same target + category is refused.
 */
export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	const invalid = (message: string) =>
		json({ error: message }, { status: 400, headers: { 'cache-control': 'no-store' } });

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return invalid('Invalid request body.');
	}

	const targetType = body.targetType;
	if (!isReportTargetType(targetType)) {
		return invalid('Choose whether you are reporting an event or a profile.');
	}
	const targetId = clean(body.targetId, 120);
	if (!targetId) return invalid('That target could not be identified.');
	const category = clean(body.category, 40);
	if (!isValidReportCategory(targetType, category)) {
		return invalid('Choose the violation that best describes the problem.');
	}
	const details = clean(body.details, MAX_DETAILS);
	if (details.length < MIN_DETAILS) {
		return invalid('Add a little more detail so the review team can act on it.');
	}

	// The label is a convenience for reviewers; the server caps it and never
	// trusts it as an identifier (targetId is the join key).
	const targetLabel = clean(body.targetLabel, 160) || targetId;

	// Guests can file reports, which makes this the classic spam target. The
	// challenge is checked before any database write.
	const captcha = await verifyCaptcha(body.captchaToken, clientKey(request, 'unknown'));
	if (!captcha.ok) {
		return json({ error: CAPTCHA_FAILURE_MESSAGE }, { status: 403, headers: { 'cache-control': 'no-store' } });
	}

	try {
		const report = await getSource(createSupabase(cookies)).reportContent(
			locals.session?.userId ?? null,
			{ targetType, targetId, targetLabel, category, details }
		);
		return json(
			{
				id: report.id,
				status: report.status,
				categoryLabel: report.categoryLabel || reportCategoryLabel(targetType, category),
				createdAt: report.createdAt
			},
			{ status: 201, headers: { 'cache-control': 'no-store' } }
		);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Your report could not be submitted.';
		return json({ error: message }, { status: 400 });
	}
};

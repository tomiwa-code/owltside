import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ReportSheet from '$components/ReportSheet.svelte';
import { demoSource } from '$lib/server/datasource';
import {
	REPORT_CATEGORIES,
	isValidReportCategory,
	reportCategoryLabel
} from '$lib/constants/report-categories';
import { POST as submitReport } from '../../src/routes/api/reports/+server';

/**
 * Reports about event listings and public profiles are filed by the public app
 * and reviewed in the admin console — never resolved locally.
 */

const jsonRequest = (body: unknown) =>
	new Request('http://localhost/api/reports', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

const context = (body: unknown, session: unknown = null) =>
	({
		request: jsonRequest(body),
		locals: { session, demoMode: true },
		cookies: { getAll: () => [], get: () => undefined, set: vi.fn(), delete: vi.fn() }
	}) as never;

const valid = {
	targetType: 'event',
	targetId: 'e-warehouse',
	targetLabel: 'Underground Warehouse 04',
	category: 'misleading',
	details: 'The lineup on the page does not match the poster at all.'
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('report categories', () => {
	it('offers different violations for listings and profiles', () => {
		const eventIds = REPORT_CATEGORIES.event.map((entry) => entry.id);
		const profileIds = REPORT_CATEGORIES.profile.map((entry) => entry.id);
		expect(eventIds).toContain('misleading');
		expect(profileIds).toContain('impersonation');
		expect(eventIds).not.toContain('impersonation');
		expect(profileIds).not.toContain('misleading');
		expect(eventIds).toContain('other');
		expect(profileIds).toContain('other');
	});

	it('validates a category against its target type', () => {
		expect(isValidReportCategory('event', 'misleading')).toBe(true);
		expect(isValidReportCategory('profile', 'misleading')).toBe(false);
		expect(isValidReportCategory('profile', 'harassment')).toBe(true);
		expect(reportCategoryLabel('profile', 'harassment')).toBe('Harassment, threats or hate speech');
	});
});

describe('POST /api/reports', () => {
	it('files an event report as open', async () => {
		const response = await submitReport(context(valid));
		expect(response.status).toBe(201);
		const body = (await response.json()) as { id: string; status: string; categoryLabel: string };
		expect(body.id).toMatch(/^rep-/);
		expect(body.status).toBe('open');
		expect(body.categoryLabel).toBe('Misleading or false information');
	});

	it('files a profile report for a signed-in reporter', async () => {
		const response = await submitReport(
			context(
				{
					targetType: 'profile',
					targetId: 'u-amina',
					targetLabel: '@drbello',
					category: 'impersonation',
					details: 'This account is pretending to be the official organizer page.'
				},
				{ userId: 'u-ada', email: 'ada@owltside.app', handle: 'adaobi', name: 'Ada Obi', role: 'attendee' }
			)
		);
		expect(response.status).toBe(201);
	});

	it('rejects a category that does not belong to the target type', async () => {
		const response = await submitReport(context({ ...valid, category: 'harassment' }));
		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toMatch(/violation/i);
	});

	it('rejects an unknown target type', async () => {
		const response = await submitReport(context({ ...valid, targetType: 'ticket' }));
		expect(response.status).toBe(400);
	});

	it('requires meaningful details', async () => {
		const response = await submitReport(context({ ...valid, details: 'bad' }));
		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toMatch(/detail/i);
	});

	it('requires a target id', async () => {
		const response = await submitReport(context({ ...valid, targetId: '  ' }));
		expect(response.status).toBe(400);
	});

	it('refuses a duplicate open report for the same target and category', async () => {
		const payload = {
			targetType: 'event' as const,
			targetId: 'e-duplicate-check',
			targetLabel: 'Duplicate Check Night',
			category: 'scam',
			details: 'Selling tickets that do not exist anywhere on the platform.'
		};
		const first = await submitReport(context({ ...payload, details: `${payload.details} One.` }));
		expect(first.status).toBe(201);
		const second = await submitReport(context({ ...payload, details: `${payload.details} Two.` }));
		expect(second.status).toBe(400);
		expect(((await second.json()) as { error: string }).error).toMatch(/already reported/i);
	});
});

describe('reportContent (demo datasource)', () => {
	it('keeps the report open and records who filed it', async () => {
		const report = await demoSource.reportContent('u-ada', {
			targetType: 'profile',
			targetId: 'u-chiamaka',
			targetLabel: '@chiamaka',
			category: 'spam',
			details: 'Only sends promotional broadcast messages to followers.'
		});
		expect(report.status).toBe('open');
		expect(report.targetType).toBe('profile');
		expect(report.reporterHandle).toBe('adaobi');
		expect(report.categoryLabel).toBe('Spam or fake account');
	});

	it('lets guests report without an account', async () => {
		const report = await demoSource.reportContent(null, {
			targetType: 'event',
			targetId: 'e-hackathon',
			targetLabel: 'Build Night Hackathon',
			category: 'wrong-details',
			details: 'The venue on the listing has been closed for months.'
		});
		expect(report.reporterId).toBeUndefined();
		expect(report.status).toBe('open');
	});
});

describe('ReportSheet', () => {
	const openSheet = (targetType: 'event' | 'profile') =>
		render(ReportSheet, {
			open: true,
			targetType,
			targetId: targetType === 'event' ? 'e-warehouse' : 'u-amina',
			targetLabel: targetType === 'event' ? 'Underground Warehouse 04' : '@drbello',
			close: vi.fn()
		});

	it('asks for a violation category and details before submitting', async () => {
		openSheet('event');
		expect(screen.getByText('Report this listing')).toBeInTheDocument();
		const select = screen.getByLabelText('Violation category');
		const submit = screen.getByRole('button', { name: /Submit report/i });
		expect(submit).toBeDisabled();

		await fireEvent.change(select, { target: { value: 'scam' } });
		expect(submit).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Additional details'), {
			target: { value: 'Tickets are being sold on a fake payment page.' }
		});
		expect(submit).not.toBeDisabled();
	});

	it('offers profile-specific violations on a profile report', async () => {
		openSheet('profile');
		expect(screen.getByText('Report this profile')).toBeInTheDocument();
		const options = Array.from(
			(screen.getByLabelText('Violation category') as HTMLSelectElement).options
		).map((option) => option.textContent);
		expect(options.join(' ')).toMatch(/Impersonation/);
		expect(options.join(' ')).not.toMatch(/duplicate listing/i);
	});

	it('posts the report and confirms it was submitted', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'rep-1', status: 'open' }), {
				status: 201,
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		openSheet('event');

		await fireEvent.change(screen.getByLabelText('Violation category'), { target: { value: 'safety' } });
		await fireEvent.input(screen.getByLabelText('Additional details'), {
			target: { value: 'No licensed capacity for a boat party of this size.' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Submit report/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/reports');
		expect(JSON.parse(String(init.body))).toMatchObject({
			targetType: 'event',
			targetId: 'e-warehouse',
			category: 'safety'
		});
		await waitFor(() => expect(screen.getByText('Report submitted')).toBeInTheDocument());
	});

	it('shows the server error instead of pretending success', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: 'You already reported this — the review team is on it.' }), {
					status: 400,
					headers: { 'content-type': 'application/json' }
				})
			)
		);
		openSheet('event');
		await fireEvent.change(screen.getByLabelText('Violation category'), { target: { value: 'scam' } });
		await fireEvent.input(screen.getByLabelText('Additional details'), {
			target: { value: 'The payment page is fake and takes card details.' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Submit report/i }));

		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent(/already reported/i)
		);
		expect(screen.queryByText('Report submitted')).not.toBeInTheDocument();
	});
});

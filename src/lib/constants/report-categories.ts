/**
 * Violation categories offered in the public report forms.
 *
 * Kept in one place so the form, the API validator and the admin console all
 * agree on the exact ids and wording. A report can target an event listing or
 * a public profile.
 */

export type ReportTargetType = 'event' | 'profile';

export interface ReportCategory {
	id: string;
	label: string;
	/** Shown under the select to set expectations for the review team. */
	hint?: string;
}

export const REPORT_CATEGORIES: Record<ReportTargetType, ReportCategory[]> = {
	event: [
		{ id: 'misleading', label: 'Misleading or false information' },
		{ id: 'scam', label: 'Scam, fraud or fake tickets' },
		{ id: 'prohibited', label: 'Prohibited or illegal activity' },
		{ id: 'safety', label: 'Safety or security concern' },
		{ id: 'wrong-details', label: 'Wrong date, venue or pricing' },
		{ id: 'offensive', label: 'Offensive or hateful content' },
		{ id: 'spam', label: 'Spam or duplicate listing' },
		{ id: 'other', label: 'Something else' }
	],
	profile: [
		{ id: 'impersonation', label: 'Impersonation or fake identity' },
		{ id: 'harassment', label: 'Harassment, threats or hate speech' },
		{ id: 'scam', label: 'Scam or fraudulent behaviour' },
		{ id: 'spam', label: 'Spam or fake account' },
		{ id: 'inappropriate', label: 'Inappropriate or explicit content' },
		{ id: 'underage', label: 'Person appears to be under 18' },
		{ id: 'other', label: 'Something else' }
	]
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
	event: 'event listing',
	profile: 'user profile'
};

export const isReportTargetType = (value: unknown): value is ReportTargetType =>
	value === 'event' || value === 'profile';

export function reportCategoryLabel(targetType: ReportTargetType, categoryId: string): string {
	return REPORT_CATEGORIES[targetType].find((entry) => entry.id === categoryId)?.label ?? categoryId;
}

export function isValidReportCategory(targetType: ReportTargetType, categoryId: string): boolean {
	return REPORT_CATEGORIES[targetType].some((entry) => entry.id === categoryId);
}

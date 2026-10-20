/**
 * Unread counters are shown in the header and next to every chat row, so they
 * share one cap ("99+") and one presentation.
 */
export function formatCount(count: number): string {
	return count > 99 ? '99+' : String(count);
}

/** Red pill used for every unread count (header icons and inbox rows). */
export const UNREAD_BADGE_CLASS =
	'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-none shadow-sm';

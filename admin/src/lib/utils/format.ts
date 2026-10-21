const NGN = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-US');
export const LAGOS_TZ = 'Africa/Lagos';

const DATE = new Intl.DateTimeFormat('en-NG', {
	day: '2-digit',
	month: 'short',
	year: 'numeric',
	timeZone: LAGOS_TZ
});
const DATE_LONG = new Intl.DateTimeFormat('en-NG', {
	weekday: 'short',
	day: '2-digit',
	month: 'short',
	year: 'numeric',
	timeZone: LAGOS_TZ
});
const TIME = new Intl.DateTimeFormat('en-NG', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: LAGOS_TZ
});
const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: LAGOS_TZ
});
const TIME_SECONDS = new Intl.DateTimeFormat('en-NG', {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
	timeZone: LAGOS_TZ
});

/** ₦142,850,000 */
export function money(n: number, opts: { sign?: boolean } = {}): string {
	const sign = n < 0 ? '-' : opts.sign ? '+' : '';
	return `${sign}₦${NGN.format(Math.abs(Math.round(n)))}`;
}

/** Compact treasury notation: ₦142.85M / ₦1.84B / ₦74.5K */
export function moneyCompact(n: number): string {
	const abs = Math.abs(n);
	const sign = n < 0 ? '-' : '';
	if (abs >= 1_000_000_000) return `${sign}₦${trim(abs / 1_000_000_000)}B`;
	if (abs >= 1_000_000) return `${sign}₦${trim(abs / 1_000_000)}M`;
	if (abs >= 1_000) return `${sign}₦${trim(abs / 1_000)}K`;
	return `${sign}₦${NGN.format(abs)}`;
}

function trim(value: number): string {
	const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(2);
	return fixed.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

export function num(n: number): string {
	return NUM.format(Math.round(n));
}

export function compact(n: number): string {
	if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
	if (n >= 10_000) return `${trim(n / 1_000)}K`;
	return NUM.format(n);
}

export function pct(n: number, digits = 1): string {
	return `${n.toFixed(digits).replace(/\.0$/, '')}%`;
}

export function date(iso: string): string {
	return DATE.format(new Date(iso));
}

export function dateLong(iso: string): string {
	return DATE_LONG.format(new Date(iso));
}

/** Nov 14 */
export function shortDate(iso: string): string {
	return MONTH_DAY.format(new Date(iso));
}

/** Nov 14, 2026 */
export function monthDayYear(iso: string): string {
	return `${MONTH_DAY.format(new Date(iso))}, ${new Date(iso).getFullYear()}`;
}

export function time(iso: string): string {
	return TIME.format(new Date(iso));
}

export function timestamp(iso: string): string {
	return `${TIME_SECONDS.format(new Date(iso))} WAT`;
}

export function dateTime(iso: string): string {
	return `${DATE.format(new Date(iso))} · ${TIME.format(new Date(iso))} WAT`;
}

export function relative(iso: string, now: Date = new Date()): string {
	const delta = now.getTime() - new Date(iso).getTime();
	const future = delta < 0;
	const mins = Math.round(Math.abs(delta) / 60000);
	if (mins < 1) return 'just now';
	const value = (() => {
		if (mins < 60) return `${mins}m`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.round(hours / 24);
		if (days < 30) return `${days}d`;
		const months = Math.round(days / 30);
		if (months < 12) return `${months}mo`;
		return `${Math.round(months / 12)}y`;
	})();
	return future ? `in ${value}` : `${value} ago`;
}

export function relativeLong(iso: string, now: Date = new Date()): string {
	const delta = new Date(iso).getTime() - now.getTime();
	const abs = Math.abs(delta);
	const day = 86_400_000;
	const label =
		abs < 3_600_000
			? `${Math.max(1, Math.round(abs / 60_000))} minutes`
			: abs < day
				? `${Math.round(abs / 3_600_000)} hours`
				: `${Math.round(abs / day)} days`;
	return delta >= 0 ? `in ${label}` : `${label} ago`;
}

export function countdown(iso: string, now: Date = new Date()): string {
	const delta = new Date(iso).getTime() - now.getTime();
	if (delta <= 0) return 'Now';
	const mins = Math.round(delta / 60_000);
	if (mins < 60) return `${mins} min`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return `${hours} hr`;
	return `${Math.round(hours / 24)} days`;
}

export function initials(name: string): string {
	const parts = name
		.replace(/^(dr|mr|mrs|ms|miss)\.?\s+/i, '')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (parts.length === 0) return 'OW';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function titleCase(value: string): string {
	return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortHash(value: string, head = 6, tail = 4): string {
	if (value.length <= head + tail + 1) return value;
	return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function percentOf(part: number, total: number): number {
	if (!total) return 0;
	return (part / total) * 100;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

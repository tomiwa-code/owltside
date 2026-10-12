const DAY = 86_400_000;

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
	return new Date(iso).toLocaleDateString('en-NG', opts ?? { month: 'short', day: '2-digit' });
}

export function fmtDateFull(iso: string): string {
	return new Date(iso).toLocaleDateString('en-NG', {
		weekday: 'short',
		month: 'short',
		day: '2-digit',
		year: 'numeric'
	});
}

export function fmtTime(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDateTime(iso: string): string {
	return `${fmtDate(iso)} • ${fmtTime(iso)}`;
}

export function fmtRelative(iso: string, now = Date.now()): string {
	const diff = new Date(iso).getTime() - now;
	const abs = Math.abs(diff);
	const suffix = diff >= 0 ? '' : ' ago';
	if (abs < 60_000) return diff >= 0 ? 'now' : 'just now';
	if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m${suffix}`;
	if (abs < DAY) return `${Math.round(abs / 3_600_000)}h${suffix}`;
	if (abs < 7 * DAY) return `${Math.round(abs / DAY)}d${suffix}`;
	return fmtDate(iso);
}

export interface CountdownParts {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	past: boolean;
}

export function countdown(iso: string, now = Date.now()): CountdownParts {
	let diff = new Date(iso).getTime() - now;
	const past = diff < 0;
	diff = Math.abs(diff);
	return {
		days: Math.floor(diff / DAY),
		hours: Math.floor((diff % DAY) / 3_600_000),
		minutes: Math.floor((diff % 3_600_000) / 60_000),
		seconds: Math.floor((diff % 60_000) / 1000),
		past
	};
}

export function countdownLabel(iso: string, now = Date.now()): string {
	const c = countdown(iso, now);
	if (c.past) return 'Started';
	if (c.days > 0) return `In ${c.days}d ${c.hours}h`;
	if (c.hours > 0) return `In ${c.hours}h ${c.minutes}m`;
	return `In ${c.minutes}m`;
}

/** 30-second rotating window index used by the HMAC QR tokens. */
export function tokenWindow(now = Date.now(), windowSec = 30): number {
	return Math.floor(now / 1000 / windowSec);
}

export function secondsLeftInWindow(now = Date.now(), windowSec = 30): number {
	return windowSec - (Math.floor(now / 1000) % windowSec);
}

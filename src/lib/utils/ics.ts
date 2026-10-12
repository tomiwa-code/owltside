/** Build an .ics calendar file and trigger a client-side download. */
export function downloadIcs(opts: { title: string; venue: string; startsAt: string; endsAt?: string }): void {
	const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	const end = opts.endsAt ?? new Date(new Date(opts.startsAt).getTime() + 3 * 3_600_000).toISOString();
	const ics = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Owltside//Events//EN',
		'BEGIN:VEVENT',
		`UID:${Date.now()}@owltside`,
		`DTSTART:${fmt(opts.startsAt)}`,
		`DTEND:${fmt(end)}`,
		`SUMMARY:${opts.title}`,
		`LOCATION:${opts.venue}`,
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
	const blob = new Blob([ics], { type: 'text/calendar' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${opts.title.replace(/\s+/g, '-').toLowerCase()}.ics`;
	a.click();
	URL.revokeObjectURL(url);
}

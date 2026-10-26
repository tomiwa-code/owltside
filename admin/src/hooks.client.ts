import type { HandleClientError } from '@sveltejs/kit';

/**
 * Client-side error reporting.
 *
 * The preview runs inside an embedded frame, so there is no devtools console to
 * inspect when something throws. Posting the failure to the dev server puts it
 * in the same log the operator (and the assistant) can read, which turns "the
 * page was blank" into an actual stack trace.
 */
function report(payload: { message: string; stack?: string; source: string }): void {
	if (import.meta.env.DEV === false) return;
	try {
		void fetch('/api/client-log', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, url: location.href, ua: navigator.userAgent.slice(0, 120) }),
			keepalive: true
		});
	} catch {
		/* reporting must never throw */
	}
}

if (typeof window !== 'undefined') {
	window.addEventListener('error', (event) => {
		report({
			source: 'window.error',
			message: event.message || 'Unknown error',
			stack: event.error?.stack
		});
	});
	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason;
		report({
			source: 'unhandledrejection',
			message: reason instanceof Error ? reason.message : String(reason),
			stack: reason instanceof Error ? reason.stack : undefined
		});
	});
}

export const handleError: HandleClientError = ({ error, status, message }) => {
	const err = error instanceof Error ? error : new Error(String(error));
	report({ source: `kit:${status}`, message: message || err.message, stack: err.stack });
	return { message: message || err.message };
};

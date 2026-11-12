<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { loginFailureMessage, readLoginResult } from '$admin/utils/login-response';
	import { ArrowLeft, ArrowRight, KeyRound, Lock, Mail, RefreshCw, Send, ShieldAlert } from '@lucide/svelte';

	let { data, form } = $props();

	let email = $state(untrack(() => form?.email ?? ''));
	let code = $state('');
	let codeSent = $state(untrack(() => Boolean(form?.codeSent)));
	let formElement = $state<HTMLFormElement | null>(null);
	let remember = $state(true);
	let busy = $state(false);
	let googleBusy = $state(false);
	let error = $state<string | null>(null);
	let info = $state<string | null>(untrack(() => (form?.resent ? 'A fresh 6-digit code was sent to your email.' : null)));
	let status = $state<string | null>(null);
	let blockedHint = $state(false);
	let probeNote = $state<string | null>(null);
	let sessionBlocked = $state(false);
	let diagOpen = $state(false);
	let diagBusy = $state(false);
	let diagnostics = $state<string[]>([]);
	let lastActionSummary = $state<string | null>(null);

	const shownError = $derived(error ?? form?.error ?? data.urlError ?? null);
	const ATTEMPT_KEY = 'owl-admin-login-attempt';

	function readMarker(): number {
		try {
			return Number(sessionStorage.getItem(ATTEMPT_KEY) ?? 0);
		} catch {
			return 0;
		}
	}

	function writeMarker(): void {
		try {
			sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()));
		} catch {
			/* storage blocked in sandboxed iframe */
		}
	}

	function sameOriginPath(target: string): string {
		try {
			const next = new URL(target, window.location.origin);
			return next.origin === window.location.origin ? next.pathname + next.search + next.hash : target;
		} catch {
			return target;
		}
	}

	async function sendLoginCode(event?: SubmitEvent, isResend = false) {
		event?.preventDefault();
		if (busy || googleBusy) return;

		error = null;
		info = null;
		status = null;

		const trimmed = email.trim().toLowerCase();
		if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
			error = 'Enter a valid Owltside email address.';
			formElement?.querySelector<HTMLInputElement>('#email')?.focus();
			return;
		}

		busy = true;
		status = isResend ? 'Resending verification code…' : 'Checking administrator role…';

		const body = new FormData();
		body.set('email', trimmed);
		body.set('next', data.next ?? '/dashboard');
		if (isResend) body.set('resend', '1');

		try {
			const response = await fetch(`${window.location.pathname}?/sendCode`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				credentials: 'same-origin',
				cache: 'no-store'
			});

			const payload = await readLoginResult(response);
			lastActionSummary = `Last request: HTTP ${response.status} · ${payload?.type ?? 'invalid response'}`;

			if (payload?.type === 'success') {
				email = payload.data?.email ?? trimmed;
				codeSent = true;
				code = '';
				info = isResend
					? `Sent a fresh 6-digit code to ${email}.`
					: `Enter the 6-digit verification code sent to ${email}.`;
				status = null;
				return;
			}

			if (payload?.type === 'failure' || payload?.type === 'error') {
				error = loginFailureMessage(payload, response.status);
				status = null;
				return;
			}

			error = `The control plane answered with HTTP ${response.status} instead of a sign-in result. Reload and try again.`;
			status = null;
		} catch {
			error = 'Unable to reach the control plane. Check your connection and try again.';
			lastActionSummary = 'Last sign-in: request failed before a result was received.';
			status = null;
		} finally {
			busy = false;
			if (status?.endsWith('…')) status = null;
		}
	}

	async function verifyLoginCode(event: SubmitEvent) {
		event.preventDefault();
		if (busy || googleBusy) return;

		error = null;
		info = null;
		status = null;

		const cleanCode = code.replace(/\D/g, '').slice(0, 6);
		if (cleanCode.length !== 6) {
			error = 'Enter the 6-digit verification code sent to your email.';
			formElement?.querySelector<HTMLInputElement>('#otp-code')?.focus();
			return;
		}

		busy = true;
		status = 'Verifying code & administrator privileges…';

		const body = new FormData();
		body.set('email', email.trim().toLowerCase());
		body.set('code', cleanCode);
		body.set('remember', remember ? 'on' : 'off');
		body.set('next', data.next ?? '/dashboard');

		try {
			const response = await fetch(`${window.location.pathname}?/verifyCode`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				credentials: 'same-origin',
				cache: 'no-store'
			});

			const payload = await readLoginResult(response);
			lastActionSummary = `Last verify: HTTP ${response.status} · ${payload?.type ?? 'invalid response'}`;

			if (payload?.type === 'redirect') {
				status = 'Verified — checking session…';
				writeMarker();

				const probe = await fetch('/api/session-probe', {
					credentials: 'same-origin',
					cache: 'no-store'
				})
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null);

				if (probe && probe.authed === false) {
					sessionBlocked = true;
					status = null;
					return;
				}

				status = 'Signed in — opening the dashboard…';
				window.location.assign(sameOriginPath(payload.location ?? data.next ?? '/dashboard'));
				return;
			}

			if (payload?.type === 'failure' || payload?.type === 'error') {
				error = loginFailureMessage(payload, response.status);
				if (response.status === 403) {
					codeSent = false;
					code = '';
				}
				status = null;
				return;
			}

			error = 'Unexpected sign-in response. Please try again.';
			status = null;
		} catch {
			error = 'Unable to reach the control plane. Check your connection and try again.';
			lastActionSummary = 'Last verify: request failed before a result was received.';
			status = null;
		} finally {
			busy = false;
			if (status === 'Verifying code & administrator privileges…') status = null;
		}
	}

	async function signInWithGoogle(event: SubmitEvent) {
		event.preventDefault();
		if (busy || googleBusy) return;

		error = null;
		info = null;
		googleBusy = true;
		status = 'Connecting to Google…';

		const body = new FormData();
		body.set('next', data.next ?? '/dashboard');

		try {
			const response = await fetch(`${window.location.pathname}?/google`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				credentials: 'same-origin',
				cache: 'no-store'
			});

			const payload = await readLoginResult(response);
			if (payload?.type === 'redirect' && payload.location) {
				window.location.assign(payload.location);
				return;
			}
			if (payload?.type === 'failure' || payload?.type === 'error') {
				error = loginFailureMessage(payload, response.status);
				status = null;
				googleBusy = false;
				return;
			}
			error = 'Google sign-in could not be started. Try using your email login code.';
			status = null;
			googleBusy = false;
		} catch {
			error = 'Unable to reach Google sign-in. Check your connection and try again.';
			status = null;
			googleBusy = false;
		}
	}

	function resetToEmail() {
		codeSent = false;
		code = '';
		error = null;
		info = null;
	}

	function openInNewTab() {
		const target = `${window.location.origin}/dashboard`;
		const opened = window.open(target, '_blank', 'noopener');
		if (!opened) window.location.assign(target);
	}

	async function runDiagnostics() {
		diagBusy = true;
		diagnostics = [];
		const lines: string[] = [];
		const push = (line: string) => {
			lines.push(line);
			diagnostics = [...lines];
		};

		const framed = window.self !== window.top;
		push(`context: ${framed ? 'embedded frame' : 'top-level tab'}`);
		push(`origin: ${window.location.origin}`);
		push(`secure context: ${window.isSecureContext ? 'yes' : 'no'}`);
		try {
			window.localStorage.getItem('probe');
			push('storage: writable');
		} catch {
			push('storage: BLOCKED (sandboxed frame)');
		}

		push(lastActionSummary ?? 'No sign-in request has been made in this tab.');
		push('Diagnostics do not submit credentials or consume login attempts.');

		try {
			const probe = await fetch('/api/session-probe', { credentials: 'same-origin', cache: 'no-store' }).then((r) =>
				r.json()
			);
			push(`session: authed=${probe.authed} · cookieSeen=${probe.cookieSeen}`);
		} catch {
			push('session probe: unreachable');
		}

		diagBusy = false;
	}

	/**
	 * Landing back here right after a sign-in attempt means the redirect came
	 * back instead of sticking.
	 */
	onMount(() => {
		const attemptedAt = readMarker();
		if (!attemptedAt || Date.now() - attemptedAt > 45_000) return;
		try {
			sessionStorage.removeItem(ATTEMPT_KEY);
		} catch {
			/* ignore */
		}
		blockedHint = true;

		const framed = window.self !== window.top ? '1' : '0';
		fetch(`/api/session-probe?framed=${framed}`, { credentials: 'same-origin', cache: 'no-store' })
			.then((response) => (response.ok ? response.json() : null))
			.then((probe) => {
				if (!probe) return;
				if (probe.authed) {
					window.location.assign(data.next ?? '/dashboard');
					return;
				}
				probeNote = probe.cookieSeen
					? 'The session cookie reached the server but was rejected — your admin role may have changed or expired. Try signing in again.'
					: framed === '1'
						? 'Your browser blocked the session cookie for this embedded preview. Open the preview in its own tab.'
						: 'Your browser did not store the session cookie. Check that cookies are enabled for this site, then try again.';
			})
			.catch(() => undefined);
	});
</script>

<svelte:head>
	<title>Sign in · Owltside Admin</title>
	<meta name="description" content="Restricted internal admin workspace." />
</svelte:head>

<div class="relative flex min-h-dvh flex-col overflow-hidden bg-[#0c0c10]">
	<div class="pointer-events-none absolute inset-0 surface-grid opacity-60"></div>
	<div
		class="pointer-events-none absolute left-1/2 top-[-18%] h-[560px] w-[860px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[110px]"
		style="background:radial-gradient(circle, #8b7bff 0%, transparent 65%)"
	></div>
	<div
		class="pointer-events-none absolute bottom-[-30%] right-[-10%] h-[420px] w-[620px] rounded-full opacity-[0.08] blur-[120px]"
		style="background:radial-gradient(circle, #67e8f9 0%, transparent 60%)"
	></div>

	<main class="relative flex flex-1 items-center justify-center px-4 py-10 sm:py-14">
		<div class="w-full max-w-[520px]">
			<div class="rounded-2xl border border-[#2b2b34] bg-[#151519]/95 p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:p-8">
				<div class="flex items-center justify-between gap-3">
					<span class="inline-flex items-center gap-1.5 rounded-[5px] border border-[#35353f] bg-[#1e1e25] px-2 py-1 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#b6b6c1]">
						<Lock size={9} />
						Admin &amp; Super Admin access only
					</span>
					<span class="inline-flex items-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#9d9da8]">
						<span class="status-dot"></span> Live
					</span>
				</div>

				<div class="mt-7 flex items-center gap-2.5">
					<img src="/logo.png" alt="Owltside" class="h-[24px] w-auto" />
					<span class="chip ml-1 !h-[18px] !text-[8px]">Admin</span>
				</div>

				<h1 class="mt-5 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#f2f2f7]">
					{codeSent ? 'Enter verification code' : 'Sign in to Admin'}
				</h1>
				<p class="mt-1.5 max-w-[430px] text-[12.5px] leading-relaxed text-[#9c9ca8]">
					{#if codeSent}
						We sent a 6-digit login code to <strong class="text-[#e8e8f0]">{email}</strong>.
					{:else}
						Sign in with your Owltside account. Only accounts assigned the <strong class="text-[#dcdce6]">Admin</strong> or <strong class="text-[#dcdce6]">Super Admin</strong> role are permitted into this workspace.
					{/if}
				</p>

				{#if sessionBlocked}
					<div class="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-3 py-2.5 text-[11.5px] leading-snug text-amber-100" role="alert">
						<p class="flex items-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.12em] text-amber-200">
							<ShieldAlert size={12} /> Signed in, but the session cookie was blocked
						</p>
						<p class="mt-1.5 text-[11px] leading-relaxed text-amber-100/85">
							Your admin identity was verified, but this embedded preview frame blocked the session cookie.
							Open the console in its own tab and sign in there.
						</p>
						<button
							type="button"
							class="mt-2 w-full rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1.5 font-code text-[9px] uppercase tracking-[0.1em] text-amber-50 transition hover:bg-amber-400/25"
							onclick={openInNewTab}
						>
							Open the admin workspace in a new tab
						</button>
					</div>
				{/if}

				{#if shownError}
					<div class="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2.5 text-[11.5px] leading-snug text-red-200" role="alert">
						<ShieldAlert size={14} class="mt-0.5 shrink-0" />
						<span>{shownError}</span>
					</div>
				{/if}

				{#if info && !shownError}
					<div class="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2.5 text-[11.5px] leading-snug text-emerald-100" role="status">
						<Mail size={14} class="mt-0.5 shrink-0 text-emerald-300" />
						<span>{info}</span>
					</div>
				{/if}

				{#if blockedHint}
					<div class="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11.5px] leading-snug text-amber-100" role="alert">
						<ShieldAlert size={14} class="mt-0.5 shrink-0" />
						<span>
							{probeNote ?? 'The sign-in was accepted but the session did not stick. Checking why…'}
						</span>
					</div>
				{/if}

				{#if !codeSent}
					<form
						method="POST"
						action="?/sendCode"
						class="mt-5 space-y-4"
						novalidate
						bind:this={formElement}
						onsubmit={(event) => sendLoginCode(event, false)}
					>
						<input type="hidden" name="next" value={data.next} />
						<div>
							<label class="field-label" for="email">
								<span>Email address</span>
								<span class="!text-[8px] !tracking-[0.12em] text-[#6a6a76]">Same login as Owltside app</span>
							</label>
							<div class="relative">
								<Mail size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6f6f7b]" />
								<input
									id="email"
									name="email"
									type="email"
									inputmode="email"
									required
									autocomplete="email"
									bind:value={email}
									class="input !h-[42px] !pl-9 !text-[13px]"
									placeholder="you@example.com"
								/>
							</div>
							<p class="mt-1.5 text-[11px] text-[#7f7f8d]">
								We'll verify your admin role and send a 6-digit login code to your email.
							</p>
						</div>

						<button
							type="submit"
							disabled={busy || googleBusy}
							class="btn btn-primary !h-[42px] w-full !rounded-lg !text-[11px] !font-semibold uppercase !tracking-[0.1em]"
							aria-busy={busy}
						>
							{#if busy}
								Sending login code…
							{:else}
								<Send size={13} />
								Send 6-Digit Login Code
							{/if}
						</button>
					</form>

					<div class="relative my-4 flex items-center justify-center">
						<div class="h-px w-full bg-[#26262e]"></div>
						<span class="absolute bg-[#151519] px-3 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#6f6f7b]">
							Or continue with
						</span>
					</div>

					<form method="POST" action="?/google" onsubmit={signInWithGoogle}>
						<input type="hidden" name="next" value={data.next} />
						<button
							type="submit"
							disabled={busy || googleBusy}
							class="btn !h-[42px] w-full justify-center gap-2.5 !rounded-lg !border-[#2f2f39] !bg-[#1b1b22] !text-[12px] !font-medium !text-[#ececf3] hover:!border-[#484857]"
						>
							{#if googleBusy}
								Connecting to Google…
							{:else}
								<svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
									<path d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z" fill="#EA4335"></path>
									<path d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z" fill="#4285F4"></path>
									<path d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z" fill="#FBBC05"></path>
									<path d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z" fill="#34A853"></path>
								</svg>
								Continue with Google
							{/if}
						</button>
					</form>
				{:else}
					<form
						method="POST"
						action="?/verifyCode"
						class="mt-5 space-y-4"
						novalidate
						bind:this={formElement}
						onsubmit={verifyLoginCode}
					>
						<input type="hidden" name="email" value={email} />
						<input type="hidden" name="next" value={data.next} />

						<div>
							<label class="field-label" for="otp-code">
								<span>6-digit verification code</span>
								<span class="!text-[8px] !tracking-[0.12em] text-[#6a6a76]">Email OTP</span>
							</label>
							<div class="relative">
								<KeyRound size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6f6f7b]" />
								<input
									id="otp-code"
									name="code"
									type="text"
									inputmode="numeric"
									pattern="[0-9]*"
									maxlength="6"
									required
									autocomplete="one-time-code"
									value={code}
									oninput={(e) => {
										code = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
									}}
									class="input !h-[44px] !pl-9 !font-code !text-[16px] !tracking-[0.28em]"
									placeholder="000000"
								/>
							</div>
						</div>

						<label class="flex cursor-pointer items-start gap-2.5 pt-0.5">
							<input type="checkbox" name="remember" class="checkbox mt-0.5" bind:checked={remember} />
							<span class="text-[11.5px] leading-snug text-[#a7a7b3]">
								Remember device for 12 hours
								<span class="text-[#6f6f7b]">(Default session: 2 hours)</span>
							</span>
						</label>

						<button
							type="submit"
							disabled={busy}
							class="btn btn-primary !h-[42px] w-full !rounded-lg !text-[11px] !font-semibold uppercase !tracking-[0.1em]"
							aria-busy={busy}
						>
							{busy ? 'Verifying…' : 'Verify & sign in to admin workspace'}
							{#if !busy}<ArrowRight size={14} />{/if}
						</button>

						<div class="flex items-center justify-between pt-1">
							<button
								type="button"
								disabled={busy}
								onclick={resetToEmail}
								class="inline-flex items-center gap-1 font-code text-[9px] uppercase tracking-[0.1em] text-[#9c9ca8] hover:text-[#ececf3]"
							>
								<ArrowLeft size={11} /> Use a different email
							</button>
							<button
								type="button"
								disabled={busy}
								onclick={() => sendLoginCode(undefined, true)}
								class="inline-flex items-center gap-1 font-code text-[9px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline"
							>
								<RefreshCw size={10} /> Resend code
							</button>
						</div>
					</form>
				{/if}

				{#if status}
					<p class="mt-3 flex items-center justify-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.12em] text-[#c6bcff]" role="status">
						<span class="status-dot !bg-[#c6bcff]"></span> {status}
					</p>
				{/if}

				<div class="mt-4">
					<button
						type="button"
						class="w-full text-center font-code text-[8.5px] uppercase tracking-[0.12em] text-[#6f6f7b] transition-colors hover:text-[#c6bcff]"
						onclick={() => {
							diagOpen = !diagOpen;
							if (diagOpen && diagnostics.length === 0) runDiagnostics();
						}}
					>
						{diagOpen ? 'Hide sign-in diagnostics' : 'Sign-in not working? Run diagnostics'}
					</button>
					{#if diagOpen}
						<div class="mt-2 rounded-lg border border-[#2a2a32] bg-[#121216] p-2.5">
							{#if diagBusy}
								<p class="font-code text-[9px] text-[#8f8f9b]">Probing…</p>
							{:else}
								<ul class="space-y-0.5">
									{#each diagnostics as line}
										<li class="font-code text-[9px] leading-relaxed text-[#a9a9b6]">
											<span class="text-[#5d5d69]">›</span> {line}
										</li>
									{/each}
								</ul>
								<button
									type="button"
									class="mt-2 font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline"
									onclick={runDiagnostics}
								>
									Run again
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<div class="mt-5 flex flex-col gap-2 px-1 font-code text-[8px] uppercase tracking-[0.14em] text-[#54545f] sm:flex-row sm:items-center sm:justify-between">
				<span class="inline-flex items-center gap-1.5"><span class="h-1 w-1 rounded-full bg-emerald-400"></span>Owltside Control Plane</span>
				<span>● TLS 1.3 Encrypted <span class="px-1 text-[#33333d]">•</span> Role-Gated Access</span>
			</div>
		</div>
	</main>
</div>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldAlert } from '@lucide/svelte';

	let { data, form } = $props();

	// Deliberate one-time snapshot: the boxes stay editable, and a failed POST
	// re-renders the component with fresh props anyway.
	let email = $state(untrack(() => form?.email ?? data.defaultEmail));
	let password = $state('');
	let formElement = $state<HTMLFormElement | null>(null);
	let remember = $state(true);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let status = $state<string | null>(null);
	let showPassword = $state(false);
	let blockedHint = $state(false);
	let probeNote = $state<string | null>(null);
	let sessionBlocked = $state(false);
	let diagOpen = $state(false);
	let diagBusy = $state(false);
	let diagnostics = $state<string[]>([]);

	// A failure surfaced by the action itself always wins over local validation.
	const shownError = $derived(error ?? form?.error ?? null);

	const ATTEMPT_KEY = 'owl-admin-login-attempt';

	// A preview iframe can be sandboxed without `allow-same-origin`, in which
	// case *touching* sessionStorage throws a SecurityError. Never let that
	// abort a sign-in: the marker is a nicety, the redirect is the job.
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
			/* storage blocked — the probe below simply will not find a marker */
		}
	}

	/**
	 * Sign in.
	 *
	 * The form is submitted by script rather than by the browser for three
	 * practical reasons, all of which have bitten this screen before:
	 *
	 *  1. An embedded preview can block native form submission outright (an
	 *     iframe without `allow-forms`), so a click does nothing at all.
	 *  2. Constraint validation (`minlength`, autofilled junk) blocks the submit
	 *     before it fires, which is invisible unless the bubble happens to be on
	 *     screen — again, "the button does nothing".
	 *  3. A failed POST is a full page load, so the typed password is lost.
	 *
	 * Every branch below ends in a visible state change, and if the fetch path
	 * is unavailable the code falls back to a real form submission.
	 */
	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;

		error = null;
		status = null;

		const trimmed = email.trim();
		if (!trimmed) {
			error = 'Enter your work email address.';
			formElement?.querySelector<HTMLInputElement>('#email')?.focus();
			return;
		}
		if (!password) {
			error = 'Enter your security password.';
			formElement?.querySelector<HTMLInputElement>('#password')?.focus();
			return;
		}
		if (password.length < 16) {
			error = `The security password must be at least 16 characters (yours is ${password.length}).`;
			formElement?.querySelector<HTMLInputElement>('#password')?.focus();
			return;
		}

		busy = true;
		status = 'Contacting the control plane…';

		const body = new FormData();
		body.set('email', trimmed);
		body.set('password', password);
		body.set('remember', remember ? 'on' : 'off');

		try {
			const response = await fetch(`${window.location.pathname}?/credentials`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				credentials: 'same-origin',
				cache: 'no-store'
			});

			const payload = await response.json().catch(() => null);

			if (payload?.type === 'redirect') {
				status = 'Credentials accepted — checking the session…';
				writeMarker();

				// Verify the cookie survived the round trip before navigating.
				// In an embedded preview a cross-site cookie is frequently
				// discarded, and without this check the app would bounce back to
				// this screen with no explanation — which reads as "the button
				// does nothing".
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
				// Full page load so the server re-reads the session cookie.
				window.location.assign(sameOriginPath(payload.location ?? data.next ?? '/dashboard'));
				return;
			}

			if (payload?.type === 'failure' || payload?.type === 'error') {
				const message =
					payload?.data?.error ??
					(typeof payload?.data === 'string' ? payload.data : null) ??
					`Sign-in was rejected (HTTP ${response.status}).`;
				error = message;
				status = null;
				return;
			}

			if (!payload) {
				// Non-JSON answer: the action endpoint is not reachable as expected.
				error = `The control plane answered with HTTP ${response.status} instead of a sign-in result. Reloading and trying again usually clears this.`;
				status = null;
				return;
			}

			error = 'Unexpected sign-in response. Please try again.';
			status = null;
		} finally {
			// `finally` runs before the redirect navigates away, but it also runs
			// on failure — so the button can never stay stuck on "Signing in…".
			busy = false;
			if (status === 'Contacting the control plane…') status = null;
		}
	}

	/**
	 * Keep navigation on the origin the admin is actually using. Behind the
	 * preview proxy the server may resolve a redirect against its internal
	 * origin (http://localhost:5174), which would strand the browser.
	 */
	function sameOriginPath(target: string): string {
		try {
			const next = new URL(target, window.location.origin);
			return next.origin === window.location.origin ? next.pathname + next.search + next.hash : target;
		} catch {
			return target;
		}
	}

	/**
	 * A blocked third-party cookie cannot be worked around from inside an
	 * embedded frame: the browser simply will not send it back. A top-level tab
	 * is a first-party context, where the same cookie is stored normally, so
	 * hand the workspace over to one.
	 */
	function openInNewTab() {
		const target = `${window.location.origin}/dashboard`;
		const opened = window.open(target, '_blank', 'noopener');
		if (!opened) window.location.assign(target);
	}

	/**
	 * Browser-side self test. It answers the questions that cannot be answered
	 * from the server log: can this tab reach the action, what does the action
	 * reply, and does the session cookie survive the round trip.
	 */
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

		const body = new FormData();
		body.set('email', email.trim());
		body.set('password', password);
		body.set('remember', remember ? 'on' : 'off');

		try {
			const response = await fetch(`${window.location.pathname}?/credentials`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				credentials: 'same-origin',
				cache: 'no-store'
			});
			const payload = await response.json().catch(() => null);
			push(`action POST: HTTP ${response.status} · ${payload?.type ?? 'non-JSON'}`);
			if (payload?.type === 'failure') {
				push(`action says: ${payload?.data?.error ?? 'rejected'}`);
			}
			if (payload?.location) push(`redirect target: ${payload.location}`);
		} catch (cause) {
			push(`action POST failed: ${(cause as Error).message}`);
		}

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
	 * back instead of sticking. Ask the server what it can see so the copy can
	 * say which of the two failure modes actually happened:
	 *   - cookie never stored  → the browser dropped it (embedded frame, cookie policy)
	 *   - cookie stored        → the session was rejected or expired
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
					? 'The session cookie reached the server but was rejected — it may have expired. Try signing in again.'
					: framed === '1'
						? 'Your browser blocked the session cookie for this embedded preview. Open the preview in its own tab, or use the hardware-key button.'
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
		<div class="w-full max-w-[552px]">
			<div class="rounded-2xl border border-[#2b2b34] bg-[#151519]/95 p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:p-8">
				<div class="flex items-center justify-between gap-3">
					<span class="inline-flex items-center gap-1.5 rounded-[5px] border border-[#35353f] bg-[#1e1e25] px-2 py-1 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#b6b6c1]">
						<Lock size={9} />
						Restricted access // Internal admin workspace
					</span>
					<span class="inline-flex items-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#9d9da8]">
						<span class="status-dot"></span> Live
					</span>
				</div>

				<div class="mt-7 flex items-center gap-2.5">
					<img src="/logo.png" alt="Owltside" class="h-[20px] w-auto" />
					<span class="chip ml-1 !h-[18px] !text-[8px]">Admin</span>
				</div>

				<h1 class="mt-5 font-display text-[29px] font-semibold leading-tight tracking-[-0.02em] text-[#f2f2f7]">
					Welcome back
				</h1>
				<p class="mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-[#9c9ca8]">
					Sign in with your administrative credentials to manage events, ticket inventory, and financial
					operations.
				</p>

				{#if sessionBlocked}
					<div class="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-3 py-2.5 text-[11.5px] leading-snug text-amber-100" role="alert">
						<p class="flex items-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.12em] text-amber-200">
							<ShieldAlert size={12} /> Signed in, but the session cookie was blocked
						</p>
						<p class="mt-1.5 text-[11px] leading-relaxed text-amber-100/85">
							Your credentials were accepted. This embedded preview frame is a third-party context, so the
							browser refuses to keep the session cookie — that is why it keeps returning to this screen.
							Open the console in its own tab and sign in there; cookies are first-party there and will stick.
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

				{#if blockedHint}
					<div class="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11.5px] leading-snug text-amber-100" role="alert">
						<ShieldAlert size={14} class="mt-0.5 shrink-0" />
						<span>
							{probeNote ??
								'The sign-in was accepted but the session did not stick. Checking why…'}
						</span>
					</div>
				{/if}

				<form
					method="POST"
					action="?/credentials"
					class="mt-4 space-y-4"
					novalidate
					bind:this={formElement}
					onsubmit={signIn}
				>
					<div>
						<label class="field-label" for="email">
							<span>Work email address</span>
							<span class="!text-[8px] !tracking-[0.12em] text-[#6a6a76]">SSO / Encrypted</span>
						</label>
						<div class="relative">
							<Mail size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6f6f7b]" />
							<input
								id="email"
								name="email"
								type="email"
								required
								autocomplete="username"
								bind:value={email}
								class="input !h-[42px] !pl-9 !text-[13px]"
								placeholder="admin@owltside.com"
							/>
						</div>
					</div>

					<div>
						<label class="field-label" for="password">
							<span>Security password</span>
							<span class="!text-[8px] !tracking-[0.12em] text-[#6a6a76]">Req: 16+ chars</span>
						</label>
						<div class="relative">
							<span class="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[#6f6f7b]">
								<span class="h-1 w-1 rounded-full bg-current"></span>
								<span class="h-1 w-1 rounded-full bg-current"></span>
								<span class="h-1 w-1 rounded-full bg-current"></span>
							</span>
							<input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								required
								minlength="16"
								autocomplete="current-password"
								bind:value={password}
								class="input !h-[42px] !pl-9 !pr-10 !text-[13px]"
								placeholder="••••••••••••••••"
							/>
							<button
								type="button"
								class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[#7c7c89] hover:text-[#ececf1]"
								aria-label={showPassword ? 'Hide password' : 'Show password'}
								onclick={() => (showPassword = !showPassword)}
							>
								{#if showPassword}
									<EyeOff size={14} />
								{:else}
									<Eye size={14} />
								{/if}
							</button>
						</div>
					</div>

					<label class="flex cursor-pointer items-start gap-2.5 pt-0.5">
						<input type="checkbox" name="remember" class="checkbox mt-0.5" bind:checked={remember} />
						<span class="text-[11.5px] leading-snug text-[#a7a7b3]">
							Remember device for 12 hours
							<span class="text-[#6f6f7b]">(Enforces Hardware Key / 2FA check on subsequent sessions)</span>
						</span>
					</label>

					<button
						type="submit"
						class="btn btn-primary mt-1 !h-[42px] w-full !rounded-lg !text-[11px] !font-semibold uppercase !tracking-[0.1em]"
						aria-busy={busy}
					>
						{busy ? 'Signing in…' : 'Sign in to admin workspace'}
						{#if !busy}<ArrowRight size={14} />{/if}
					</button>

					{#if status}
						<p class="flex items-center justify-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.12em] text-[#c6bcff]" role="status">
							<span class="status-dot !bg-[#c6bcff]"></span> {status}
						</p>
					{/if}
				</form>

				<div class="mt-3">
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

				<div class="mt-5 border-t border-[#26262e] pt-4 text-center">
					<a
						href="/settings"
						class="inline-flex items-center gap-1 font-code text-[9px] uppercase tracking-[0.12em] text-[#9c9ca8] transition-colors hover:text-[#c6bcff]"
					>
						Forgot administrative passphrase? Contact Security Team
						<span class="text-[11px]">↗</span>
					</a>
				</div>
			</div>

			<div class="mt-5 flex flex-col gap-2 px-1 font-code text-[8px] uppercase tracking-[0.14em] text-[#54545f] sm:flex-row sm:items-center sm:justify-between">
				<span class="inline-flex items-center gap-1.5"><span class="h-1 w-1 rounded-full bg-emerald-400"></span>Node: US-WEST-LAGOS-01</span>
				<span>● TLS 1.3 Encrypted <span class="px-1 text-[#33333d]">•</span> SOC-2 Type II</span>
			</div>
		</div>
	</main>
</div>

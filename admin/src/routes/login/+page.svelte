<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ArrowRight, Eye, EyeOff, Fingerprint, KeyRound, Lock, Mail, ShieldAlert } from '@lucide/svelte';
	import CopyButton from '$components/CopyButton.svelte';

	let { data, form } = $props();

	// Deliberate one-time snapshot: the boxes stay editable, and a failed POST
	// re-renders the component with fresh props anyway.
	let email = $state(untrack(() => form?.email ?? data.defaultEmail));
	let password = $state(untrack(() => data.demoPassphrase));
	let formElement = $state<HTMLFormElement | null>(null);
	let showPassword = $state(false);
	let blockedHint = $state(false);
	let probeNote = $state<string | null>(null);

	// A failure surfaced by the action itself always wins over the guesswork below.
	const shownError = $derived(form?.error ?? null);

	const ATTEMPT_KEY = 'owl-admin-login-attempt';

	/**
	 * Demo convenience: put the published sandbox credentials back into the
	 * form. Browsers happily autofill a saved work email over the defaults, and
	 * an unknown email is the most common reason a demo sign-in is rejected.
	 */
	function useDemoCredentials() {
		email = data.defaultEmail;
		password = data.demoPassphrase;
		showPassword = true;
		formElement?.querySelector<HTMLInputElement>('#password')?.focus();
	}

	/**
	 * Landing back here right after a sign-in attempt means the redirect came
	 * back instead of sticking. Ask the server what it can see so the copy can
	 * say which of the two failure modes actually happened:
	 *   - cookie never stored  → the browser dropped it (embedded frame, cookie policy)
	 *   - cookie stored        → the session was rejected or expired
	 */
	onMount(() => {
		const attemptedAt = Number(sessionStorage.getItem(ATTEMPT_KEY) ?? 0);
		if (!attemptedAt || Date.now() - attemptedAt > 45_000) return;
		sessionStorage.removeItem(ATTEMPT_KEY);
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

				{#if data.demo}
					<div class="mt-4 overflow-hidden rounded-xl border border-[#c6bcff]/25 bg-[#c6bcff]/[0.05]">
						<div class="flex items-center justify-between gap-2 border-b border-[#c6bcff]/15 px-3 py-2">
							<p class="flex items-center gap-1.5 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#c6bcff]">
								<KeyRound size={10} /> Demo security password
							</p>
							<span class="chip !h-[16px] !border-[#c6bcff]/30 !bg-[#c6bcff]/10 !text-[7px] !text-[#dcd6ff]">Sandbox only</span>
						</div>
						<div class="space-y-1.5 px-3 py-2.5">
							<div class="flex items-center justify-between gap-2">
								<span class="font-code text-[8px] uppercase tracking-[0.1em] text-[#7d7d8a]">Email</span>
								<div class="flex min-w-0 items-center gap-1">
									<code class="truncate font-code text-[10.5px] text-[#e6e1ff]">{data.defaultEmail}</code>
									<CopyButton value={data.defaultEmail} label="Copy demo email" compact />
								</div>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="font-code text-[8px] uppercase tracking-[0.1em] text-[#7d7d8a]">Password</span>
								<div class="flex min-w-0 items-center gap-1">
									<code class="truncate font-code text-[10.5px] text-[#e6e1ff]">{data.demoPassphrase}</code>
									<CopyButton value={data.demoPassphrase} label="Copy demo password" compact />
								</div>
							</div>
							<button
								type="button"
								class="mt-1 w-full rounded-md border border-[#c6bcff]/30 bg-[#c6bcff]/10 px-2 py-1.5 font-code text-[8.5px] uppercase tracking-[0.1em] text-[#dcd6ff] transition hover:bg-[#c6bcff]/20"
								onclick={useDemoCredentials}
							>
								Fill demo credentials
							</button>
							<p class="pt-0.5 text-[9.5px] leading-relaxed text-[#8f8f9b]">
								Any 16+ character passphrase is accepted in the sandbox. The hardware-key button simulates a
								FIDO2 touch.
							</p>
						</div>
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

				<form method="POST" action="?/credentials" class="mt-4 space-y-4" bind:this={formElement}>
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
						<input type="checkbox" name="remember" class="checkbox mt-0.5" checked />
						<span class="text-[11.5px] leading-snug text-[#a7a7b3]">
							Remember device for 12 hours
							<span class="text-[#6f6f7b]">(Enforces Hardware Key / 2FA check on subsequent sessions)</span>
						</span>
					</label>

					<button type="submit" class="btn btn-primary mt-1 !h-[42px] w-full !rounded-lg !text-[11px] !font-semibold uppercase !tracking-[0.1em]">
						Sign in to admin workspace
						<ArrowRight size={14} />
					</button>
				</form>

				<form method="POST" action="?/hardware" class="mt-2.5">
					<button type="submit" class="btn btn-secondary w-full !h-[40px] !text-[12px]">
						<Fingerprint size={14} />
						Hardware Security Key (WebAuthn / YubiKey)
					</button>
				</form>


				<div class="mt-6 border-t border-[#26262e] pt-4 text-center">
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

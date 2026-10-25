<script lang="ts">
	import { applyAction } from '$app/forms';
	import { onMount } from 'svelte';
	import { ArrowRight, Eye, EyeOff, Fingerprint, Lock, Mail, ShieldAlert } from '@lucide/svelte';

	let { data, form } = $props();

	let showPassword = $state(false);
	let busy = $state<'credentials' | 'hardware' | null>(null);
	let error = $state<string | null>(null);
	let blockedHint = $state(false);

	const shownError = $derived(error ?? form?.error ?? null);

	const ATTEMPT_KEY = 'owl-admin-login-attempt';

	onMount(() => {
		// If we land back on /login right after a sign-in attempt, the session
		// cookie never stuck (third-party cookie blocking in an embedded preview)
		// or the action was rejected. Say so instead of silently doing nothing.
		const attemptedAt = Number(sessionStorage.getItem(ATTEMPT_KEY) ?? 0);
		if (attemptedAt && Date.now() - attemptedAt < 45_000) {
			blockedHint = true;
			sessionStorage.removeItem(ATTEMPT_KEY);
		}
	});

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
	 * Submit through the action endpoint ourselves, then navigate with a full
	 * page load. `use:enhance` routes the redirect through the client router,
	 * which fails silently (and leaves the button disabled) if anything in the
	 * chain hiccups. Without JS the form still posts natively.
	 */
	async function submit(event: SubmitEvent, kind: 'credentials' | 'hardware') {
		const element = event.currentTarget as HTMLFormElement;
		if (!element.reportValidity()) return;
		event.preventDefault();
		if (busy) return;
		busy = kind;
		error = null;
		try {
			const response = await fetch(element.action, {
				method: 'POST',
				body: new FormData(element),
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				credentials: 'same-origin',
				cache: 'no-store'
			});
			const payload = await response.json().catch(() => null);
			if (payload?.type === 'redirect') {
				sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()));
				// Full page load: the session must be re-read by the server, and it
				// keeps working even if the client router is in a bad state.
				window.location.assign(sameOriginPath(payload.location ?? data.next ?? '/dashboard'));
				return;
			}
			// Failures and errors are devalue-encoded; applyAction renders them into
			// `form`, which the banner above already displays.
			if (payload?.type === 'failure' || payload?.type === 'error') {
				await applyAction(payload);
				error = null;
				return;
			}
			error = `Sign in failed (HTTP ${response.status}). Retry, or contact the security team.`;
		} catch {
			error = 'Could not reach the control plane. Check your connection and try again.';
		} finally {
			busy = null;
		}
	}
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
							The session cookie was not stored — this usually means the console is loading inside an
							embedded frame that blocks third-party cookies. Open the preview in its own browser tab and
							sign in there.
						</span>
					</div>
				{/if}

				<form
					method="POST"
					action="?/credentials"
					class="mt-6 space-y-4"
					onsubmit={(event) => submit(event, 'credentials')}
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
								value={form?.email ?? data.defaultEmail}
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
								value={data.demoPassphrase}
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

					<button type="submit" class="btn btn-primary mt-1 !h-[42px] w-full !rounded-lg !text-[11px] !font-semibold uppercase !tracking-[0.1em]" disabled={busy !== null}>
						{busy === 'credentials' ? 'Verifying credentials…' : 'Sign in to admin workspace'}
						{#if busy !== 'credentials'}<ArrowRight size={14} />{/if}
					</button>
				</form>

				<form
					method="POST"
					action="?/hardware"
					class="mt-2.5"
					onsubmit={(event) => submit(event, 'hardware')}
				>
					<button
						type="submit"
						class="btn btn-secondary w-full !h-[40px] !text-[12px]"
						disabled={busy !== null}
					>
						<Fingerprint size={14} />
						{busy === 'hardware' ? 'Waiting for hardware key…' : 'Hardware Security Key (WebAuthn / YubiKey)'}
					</button>
				</form>

				{#if data.demo}
					<div class="mt-4 rounded-lg border border-[#c6bcff]/20 bg-[#c6bcff]/[0.05] px-3 py-2.5">
						<p class="font-code text-[8.5px] uppercase tracking-[0.14em] text-[#c6bcff]">Demo workspace</p>
						<p class="mt-1 text-[11px] leading-relaxed text-[#9a9aa6]">
							Passphrase is pre-filled — sign in as <span class="font-code text-[#dcd6ff]">admin@owltside.com</span>
							with any 16+ characters. The hardware-key button simulates a FIDO2 touch.
						</p>
					</div>
				{/if}

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

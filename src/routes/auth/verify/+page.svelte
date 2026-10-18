<script lang="ts">
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import { ArrowLeft, ArrowRight, ShieldCheck, Timer } from '@lucide/svelte';
	import { toast } from '$lib/state/toast.svelte';

	let { data, form } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const digits = $state<string[]>(['', '', '', '', '', '']);
	let inputs: Array<HTMLInputElement | null> = [];
	let inputsDesk: Array<HTMLInputElement | null> = [];
	let verifying = $state(false);
	let resending = $state(false);
	let resendSuccess = $state(false);
	const code = $derived(digits.join(''));
	const complete = $derived(code.length === 6);
	const email = $derived(form?.email || data.email || '');

	/* resend countdown: starts at 0 so the user can resend immediately if needed */
	let resendIn = $state(0);
	$effect(() => {
		const iv = setInterval(() => (resendIn = Math.max(0, resendIn - 1)), 1000);
		return () => clearInterval(iv);
	});
	const mm = $derived(String(Math.floor(resendIn / 60)).padStart(2, '0'));
	const ss = $derived(String(resendIn % 60).padStart(2, '0'));

	function handleVerifyEnhance({ action, submitter }: { action: URL; submitter: HTMLElement | null }) {
		const isResend = action.search.includes('resend') || submitter?.getAttribute('formaction')?.includes('resend');
		resendSuccess = false;
		if (isResend) resending = true;
		else verifying = true;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			try {
				await update({ reset: false });
				if (isResend && result.type === 'success') {
					resendIn = 60;
					resendSuccess = true;
					for (let idx = 0; idx < 6; idx++) {
						digits[idx] = '';
						if (inputs[idx]) inputs[idx]!.value = '';
						if (inputsDesk[idx]) inputsDesk[idx]!.value = '';
					}
					toast('A fresh 6-digit code has been sent to your email.', 'success');
				} else if (result.type === 'failure') {
					const errMsg = typeof result.data?.error === 'string' ? result.data.error : 'Could not complete request.';
					toast(errMsg, 'error');
				}
			} finally {
				if (result.type !== 'redirect') {
					verifying = false;
				}
				resending = false;
			}
		};
	}

	function fillFromCode(raw: string, startIndex = 0, targetInputs: Array<HTMLInputElement | null> = inputs) {
		const cleaned = raw.replace(/\D/g, '');
		if (!cleaned) return;
		const offset = cleaned.length >= 6 ? 0 : startIndex;
		const chars = cleaned.slice(0, 6 - offset).split('');
		chars.forEach((c, k) => {
			digits[offset + k] = c;
			const inputEl = targetInputs[offset + k];
			if (inputEl) inputEl.value = c;
		});
		const next = Math.min(5, offset + chars.length);
		targetInputs[next]?.focus();
	}

	function onInput(i: number, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.replace(/\D/g, '');
		if (!v) {
			digits[i] = '';
			el.value = '';
			return;
		}
		if (v.length > 1) {
			fillFromCode(v, i, inputs);
			el.value = digits[i];
			return;
		}
		digits[i] = v;
		el.value = v;
		if (i < 5) inputs[i + 1]?.focus();
	}

	function onPaste(i: number, e: ClipboardEvent, targetInputs: Array<HTMLInputElement | null>) {
		const pasted = e.clipboardData?.getData('text') ?? '';
		if (/\d/.test(pasted)) {
			e.preventDefault();
			fillFromCode(pasted, i, targetInputs);
		}
	}

	function onKey(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) inputs[i - 1]?.focus();
	}

	function onInputDesk(i: number, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.replace(/\D/g, '');
		if (!v) {
			digits[i] = '';
			el.value = '';
			return;
		}
		if (v.length > 1) {
			fillFromCode(v, i, inputsDesk);
			el.value = digits[i];
			return;
		}
		digits[i] = v;
		el.value = v;
		if (i < 5) inputsDesk[i + 1]?.focus();
	}

	function onKeyDesk(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) inputsDesk[i - 1]?.focus();
	}

	/* WebOTP API support for SMS/mobile browser autofill */
	$effect(() => {
		if (typeof navigator === 'undefined' || !('credentials' in navigator)) return;
		const ac = new AbortController();
		navigator.credentials
			.get({
				// @ts-expect-error WebOTP API
				otp: { transport: ['sms'] },
				signal: ac.signal
			})
			.then((cred: unknown) => {
				const otpCode = (cred as { code?: string } | null)?.code;
				if (otpCode) {
					fillFromCode(otpCode, 0, inputs);
					fillFromCode(otpCode, 0, inputsDesk);
				}
			})
			.catch(() => {
				// Ignore abort or unsupported environments
			});
		return () => ac.abort();
	});
</script>

<!-- ── desktop (md+) "verify token" composition per the desktop design source
     (verify_token_desktop), themed with Evently Pulse tokens; mobile verify
     below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<header class="border-b border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center justify-between">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
			</a>
			<a href="/home" class="flex items-center gap-2 {MONO} text-on-surface-variant hover:text-on-surface transition-colors">
				<ArrowLeft class="w-4 h-4" /> Return to App
			</a>
		</div>
	</header>

	<main class="flex-1 flex flex-col items-center justify-center px-6 py-12">
		<div class="w-full max-w-xl">
			<div class="rounded-t-xl border border-surface-glass-border bg-surface-container px-10 py-10 flex flex-col items-center text-center">
				<span class="flex items-center gap-3">
					<span class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center justify-center">
						<ShieldCheck class="w-5 h-5 text-on-surface" />
					</span>
					<span class="font-display font-bold tracking-tight text-on-surface text-[20px]">OWLTSIDE</span>
				</span>
				<span class="flex items-center gap-2 mt-6 px-3 py-1.5 rounded-full border border-surface-glass-border bg-surface-container-high {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Passcode Dispatched
				</span>
				<h1 class="font-display text-[32px] leading-10 font-bold tracking-tight text-on-surface mt-5">Check your inbox</h1>
				<p class="text-body-md text-on-surface-variant mt-3 max-w-sm">
					We sent a 6-digit cryptographic verification code to
					<span class="block text-on-surface font-semibold mt-1">{email || 'your email'}</span>
				</p>
				<p class="text-body-sm text-on-surface-variant mt-2">
					Wrong email?
					<a href="/auth/login" class="text-on-surface underline underline-offset-4 hover:text-primary transition-colors">Change</a>
				</p>

				<form method="POST" action="?/verify" use:enhance={handleVerifyEnhance} class="w-full flex flex-col items-center mt-8">
					<input type="hidden" name="email" value={email} />
					<input type="hidden" name="name" value={data.name ?? ''} />
					<input type="hidden" name="username" value={data.username ?? ''} />
					<input type="hidden" name="code" value={code} />
					<div class="flex items-center justify-center gap-3">
						{#each digits as d, i (i)}
							<input
								bind:this={inputsDesk[i]}
								value={d}
								oninput={(e) => onInputDesk(i, e)}
								onkeydown={(e) => onKeyDesk(i, e)}
								onpaste={(e) => onPaste(i, e, inputsDesk)}
								inputmode="numeric"
								pattern="[0-9]*"
								autocomplete={i === 0 ? 'one-time-code' : 'off'}
								maxlength="6"
								aria-label="Digit {i + 1}"
								class="w-14 h-16 text-center bg-surface-base border border-surface-glass-border rounded-lg font-code text-headline-md text-on-surface focus:outline-none focus:border-primary focus:bg-surface-container-low transition-colors"
							/>
						{/each}
					</div>

					<div class="w-full flex items-center justify-between mt-6">
						<span class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-container-high border border-surface-glass-border {MONO} text-on-surface-variant">
							<Timer class="w-3.5 h-3.5" />
							{#if resendIn > 0}
								Resend code in {mm}:{ss}
							{:else}
								Didn't receive a code?
							{/if}
						</span>
						<button
							type="submit"
							formaction="?/resend"
							formnovalidate
							disabled={resendIn > 0 || resending || verifying}
							class="{MONO} text-on-surface-variant enabled:text-primary enabled:hover:underline disabled:opacity-50 transition-colors flex items-center gap-1.5"
						>
							{#if resending}
								<span>Sending code…</span>
							{:else}
								<span>Resend Code</span>
							{/if}
						</button>
					</div>

					{#if resendSuccess || form?.resent}
						<p class="text-body-sm text-accent-emerald mt-4" role="status">A fresh 6-digit code has been sent to your email.</p>
					{/if}

					{#if form?.error}
						<p class="text-body-sm text-error mt-4" role="alert">{form.error}</p>
					{/if}

					<button
						disabled={!complete || verifying || resending}
						class="w-full h-12 mt-6 rounded-md bg-primary-container text-on-primary-container text-body-md font-semibold flex items-center justify-center gap-2 transition-colors hover:bg-primary/30 disabled:opacity-40"
						type="submit"
					>
						{#if verifying}
							<span>Verifying code…</span>
						{:else}
							<span>Verify & Enter OWLTSIDE</span>
							<ArrowRight class="w-4 h-4" />
						{/if}
					</button>
					{#if data.demoMode}
						<p class="{MONO} text-on-surface-variant mt-4">Demo mode: any 6 digits work</p>
					{/if}
				</form>
			</div>
			<div class="rounded-b-xl border border-t-0 border-surface-glass-border bg-surface-container-low px-10 py-5 flex flex-col items-center gap-2 text-center">
				<span class="flex items-center gap-2 {MONO} text-on-surface">
					<ShieldCheck class="w-3.5 h-3.5" /> Tamper-Evident Session
				</span>
				<span class="{MONO} text-on-surface-variant">Codes expire in 10 minutes • Powered by OWLTSIDE Mesh Protocol</span>
			</div>
			<div class="flex items-center justify-center gap-3 mt-6 {MONO} text-on-surface-variant">
				<span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span> Node: 0x7E3-LAG-01</span>
				<span class="text-outline-variant">/</span>
				<span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span> Session: #7098F2</span>
			</div>
		</div>
	</main>

	<footer class="border-t border-surface-glass-border py-5">
		<p class="text-center {MONO} text-on-surface-variant">Secure Client Handshake // TLS 1.3 // 256-Bit Encryption</p>
	</footer>
</div>

<div class="md:hidden">
<header class="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-space-md md:max-w-lg md:mx-auto flex items-center">
		<a href="/auth/login" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="font-display text-headline-md font-semibold text-on-surface truncate">Verify it's you</h1>
	</div>
</header>

<main class="flex-1 flex flex-col relative w-full pt-mobile-header pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-gutter md:max-w-lg md:mx-auto pb-space-xl">
		<div class="flex flex-col items-center text-center mt-space-lg mb-space-md">
			<div class="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center mb-space-sm glow-primary">
				<ShieldCheck class="w-7 h-7" />
			</div>
			<p class="font-display text-headline-lg-mobile text-on-surface font-semibold">
				{data.isNew ? 'Confirm your email' : 'Enter login code'}
			</p>
			<p class="text-body-sm text-outline max-w-[300px] mt-1">
				We sent a 6-digit code to <span class="text-on-surface font-medium">{email || 'your email'}</span>.
				{#if !email}
					<span class="block mt-1">No email set — demo mode accepts any code.</span>
				{/if}
			</p>
			{#if data.demoMode}
				<p class="mt-2 font-code text-label-code text-tertiary bg-tertiary/10 border border-tertiary/20 px-2.5 py-1 rounded-full">
					DEMO HINT: ANY 6 DIGITS WORK, E.G. 000000
				</p>
			{/if}
		</div>

		<form method="POST" action="?/verify" use:enhance={handleVerifyEnhance} class="flex flex-col gap-space-md">
			<input type="hidden" name="email" value={email} />
			<input type="hidden" name="name" value={data.name ?? ''} />
			<input type="hidden" name="username" value={data.username ?? ''} />
			<input type="hidden" name="code" value={code} />
			<div class="flex items-center justify-center gap-2">
				{#each digits as d, i (i)}
					<input
						bind:this={inputs[i]}
						value={d}
						oninput={(e) => onInput(i, e)}
						onkeydown={(e) => onKey(i, e)}
						onpaste={(e) => onPaste(i, e, inputs)}
						inputmode="numeric"
						pattern="[0-9]*"
						autocomplete={i === 0 ? 'one-time-code' : 'off'}
						maxlength="6"
						aria-label="Digit {i + 1}"
						class="w-11 h-14 md:w-12 text-center bg-surface-base border border-surface-glass-border rounded-lg font-code text-headline-md text-on-surface focus:outline-none focus:border-primary transition-colors"
					/>
				{/each}
			</div>
			{#if form?.error}
				<p class="text-body-sm text-error text-center" role="alert">{form.error}</p>
			{/if}
			<button
				disabled={!complete || verifying || resending}
				class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 glow-primary"
				type="submit"
			>
				{#if verifying}
					<span>Verifying code…</span>
				{:else}
					<span>Verify & Enter</span>
				{/if}
			</button>
			<button
				class="text-body-sm text-on-surface-variant enabled:text-primary hover:text-on-surface mx-auto disabled:opacity-40 flex items-center justify-center gap-1.5"
				type="submit"
				formaction="?/resend"
				formnovalidate
				disabled={resendIn > 0 || resending || verifying}
			>
				{#if resending}
					<span>Sending code…</span>
				{:else if resendIn > 0}
					<span>Resend code in {mm}:{ss}</span>
				{:else}
					<span>Resend code</span>
				{/if}
			</button>
			{#if resendSuccess || form?.resent}
				<p class="text-body-sm text-accent-emerald text-center" role="status">A fresh code has been sent to your email.</p>
			{/if}
		</form>
	</div>
</main>
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import ThemeToggle from '$components/ThemeToggle.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import {
		authenticateWithBiometrics,
		isPlatformBiometricAvailable,
		readStoredBiometric,
		type LocalBiometricMetadata
	} from '$lib/webauthn.client';
	import {
		AtSign,
		ArrowLeft,
		BadgeCheck,
		Compass,
		Fingerprint,
		Lock,
		Mail,
		Send,
		ShieldCheck
	} from '@lucide/svelte';

	let { form } = $props();
	let email = $state('');
	let submitting = $state(false);
	let googleLoading = $state(false);
	let biometricLoading = $state(false);
	let biometricSupported = $state(false);
	let enrolledBiometric = $state<LocalBiometricMetadata | null>(null);
	const valid = $derived(/^\S+@\S+\.\S+$/.test(email));

	onMount(async () => {
		enrolledBiometric = readStoredBiometric();
		const check = await isPlatformBiometricAvailable();
		biometricSupported = check.supported;
	});

	async function handleBiometricLogin() {
		if (biometricLoading) return;
		biometricLoading = true;
		try {
			const res = await authenticateWithBiometrics();
			if (res.sessionRestored) {
				toast(`Welcome back${res.userName ? `, ${res.userName}` : ''}`, 'success');
				await goto(next || '/home', { invalidateAll: true });
			} else {
				toast(
					'Biometric passkey verified. Sign in once with email to link your active session on this device.',
					'info'
				);
			}
		} catch (err) {
			toast(
				err instanceof Error ? err.message : 'Biometric login could not be completed.',
				'error'
			);
		} finally {
			biometricLoading = false;
		}
	}

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	/* Where to land after sign-in when a gated action (buying tickets,
	   opening the wallet/profile) sent the guest here. */
	const next = $derived(page.url.searchParams.get('next') ?? '');
	const signupHref = $derived(next ? `/auth/signup?next=${encodeURIComponent(next)}` : '/auth/signup');

	function handleSendCode() {
		submitting = true;
		return async ({ result, update }: { result: { type: string; location?: string }; update: () => Promise<void> }) => {
			if (result.type === 'redirect' && result.location) {
				window.location.assign(result.location);
				return;
			}
			try {
				await update();
			} finally {
				if (result.type !== 'redirect') submitting = false;
			}
		};
	}

	function handleGoogle() {
		googleLoading = true;
		return async ({ result, update }: { result: { type: string; location?: string }; update: () => Promise<void> }) => {
			if (result.type === 'redirect' && result.location) {
				window.location.assign(result.location);
				return;
			}
			try {
				await update();
			} finally {
				if (result.type !== 'redirect') googleLoading = false;
			}
		};
	}
</script>

<!-- ── desktop (md+) composition — same design language as the desktop home
     feed, themed with the Evently Pulse tokens; mobile login below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<div class="flex-1 grid lg:grid-cols-[minmax(0,46%)_minmax(0,54%)]">
		<!-- brand / protocol panel -->
		<aside class="relative overflow-hidden border-r border-surface-glass-border bg-surface-container-low flex flex-col p-10 xl:p-14 gap-10">
			<div
				class="absolute inset-0 pointer-events-none"
				style="background-image: radial-gradient(circle at 15% 20%, rgba(99,102,241,0.14) 0, transparent 45%), radial-gradient(circle at 85% 80%, rgba(76,215,246,0.08) 0, transparent 40%);"
			></div>
			<div class="relative flex items-center gap-2.5">
				<img src="/owl-icon.png" alt="Owltside logo" class="w-8 h-8 object-contain" />

			</div>
			<div class="relative flex-1 flex flex-col justify-center gap-6">
				<div class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
					<span class="{MONO} text-on-surface-variant">Auth_Protocol // OTP-6 // NGA-LOS-01</span>
				</div>
				<h1 class="font-display text-display-hero text-on-surface">Welcome back to the night side.</h1>
				<p class="text-body-lg text-on-surface-variant max-w-md">
					Your instant radar for tonight's music arenas, secret sets, and gate tickets.
					Passwordless entry — a 6-digit code is all the door needs.
				</p>
				<div class="rounded-2xl border border-surface-glass-border bg-surface-base p-5 max-w-md">
					<div class="flex items-center gap-2">
						<ShieldCheck class="w-4 h-4 text-primary" />
						<span class="font-display font-bold text-on-surface tracking-wide text-body-md">OWLTSIDE ENGINE</span>
					</div>
					<p class="text-body-sm text-on-surface-variant leading-relaxed pt-3">
						Tamper-evident HMAC tickets. Zero scalping guaranteed. Dynamic keys rotate at
						sub-minute intervals directly signed by venue node hardware.
					</p>
					<div class="flex items-center gap-5 pt-4">
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
							P2P Fraud: 0%
						</span>
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
							Zero Speculation
						</span>
					</div>
				</div>
			</div>
		</aside>

		<!-- form panel -->
		<section class="flex flex-col items-center justify-center px-8 xl:px-16 py-12">
			<div class="w-full max-w-md flex flex-col gap-6">
				<div class="flex items-end justify-between gap-4">
					<div>
						<span class="{MONO} text-on-surface-variant">Node Access // Login</span>
						<h2 class="font-display text-headline-lg text-on-surface pt-2">Sign in to Owltside</h2>
					</div>
					<a href={signupHref} class="{MONO} text-primary hover:underline shrink-0 pb-1">Sign Up</a>
				</div>

				<form method="POST" action="?/sendCode" use:enhance={handleSendCode} class="rounded-2xl border border-surface-glass-border bg-surface-container p-7 flex flex-col gap-5">
					<input type="hidden" name="next" value={next} />
					<div class="flex flex-col gap-1.5">
						<label class="{MONO} text-on-surface-variant flex items-center justify-between" for="email-input-desktop">
							<span>Email Address</span>
							<span class="text-accent-emerald opacity-0 transition-opacity {valid ? 'opacity-100' : ''}">Valid</span>
						</label>
						<div class="relative flex items-center">
							<AtSign class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
							<input
								id="email-input-desktop"
								name="email"
								type="email"
								inputmode="email"
								required
								placeholder="rave.patron@owltside.io"
								bind:value={email}
								class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-10 pr-10 placeholder:text-outline-variant focus:outline-none focus:border-primary/50 focus:bg-surface-container-low transition-colors"
							/>
							{#if valid}
								<span class="absolute right-3.5 flex items-center justify-center text-accent-emerald">
									<BadgeCheck class="w-[18px] h-[18px]" />
								</span>
							{/if}
						</div>
						{#if form?.error}
							<p class="text-body-sm text-error">{form.error}</p>
						{/if}
						{#if page.url.searchParams.get('error')}
							<p class="text-body-sm text-error">{page.url.searchParams.get('error')}</p>
						{/if}
						<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5">
							<Mail class="w-4 h-4 text-primary shrink-0" /> We'll send a 6-digit login verification code to your email.
						</p>
					</div>

					<div class="flex items-center gap-2 bg-surface-base border border-surface-glass-border px-3 py-2.5 rounded-lg">
						<Lock class="w-4 h-4 text-accent-emerald shrink-0" />
						<span class="text-body-sm text-on-surface-variant truncate">Passwordless &amp; Instant Passcode Authentication</span>
					</div>

					<button
						disabled={submitting || googleLoading}
						class="w-full h-12 rounded-lg bg-primary text-on-primary text-body-md font-semibold flex items-center justify-center gap-2 transition-colors hover:bg-primary-container glow-primary disabled:opacity-50"
						type="submit"
					>
						{#if submitting}
							<span>Sending code…</span>
						{:else}
							<Send class="w-4 h-4" />
							<span>Send Login Code</span>
						{/if}
					</button>
				</form>

				<div class="relative flex items-center justify-center">
					<div class="w-full h-[1px] bg-surface-glass-border"></div>
					<span class="absolute bg-surface-base px-3 {MONO} text-on-surface-variant">Or Continue With</span>
				</div>

				<div class="grid grid-cols-1 gap-3">
					{#if enrolledBiometric || biometricSupported}
						<button
							type="button"
							disabled={submitting || googleLoading || biometricLoading}
							onclick={handleBiometricLogin}
							class="w-full h-12 rounded-lg bg-primary/10 border border-primary/40 text-on-surface text-body-md font-semibold flex items-center justify-center gap-2 hover:bg-primary/15 disabled:opacity-40 transition-colors"
						>
							<Fingerprint class="w-5 h-5 text-primary" />
							<span>
								{biometricLoading
									? 'Verifying biometrics…'
									: enrolledBiometric
										? `Sign in with ${enrolledBiometric.deviceLabel}`
										: 'Sign in with Fingerprint / Face ID'}
							</span>
						</button>
					{/if}
					<form method="POST" action="?/google" use:enhance={handleGoogle}>
						<input type="hidden" name="next" value={next} />
						<button type="submit" disabled={submitting || googleLoading} class="w-full h-12 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md font-semibold flex items-center justify-center gap-2 hover:border-primary/40 disabled:opacity-40">
							{#if googleLoading}
								<span>Connecting to Google…</span>
							{:else}
								<svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z" fill="#EA4335"></path><path d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z" fill="#4285F4"></path><path d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z" fill="#FBBC05"></path><path d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z" fill="#34A853"></path></svg>
								Continue with Google
							{/if}
						</button>
					</form>
				</div>

				<a href="/home" class="w-full h-12 rounded-lg bg-surface-container border border-surface-glass-border hover:border-primary/40 transition-colors text-on-surface-variant flex items-center justify-between px-4">
					<span class="flex items-center gap-2">
						<Compass class="w-4 h-4 text-on-surface-variant" />
						<span class="text-body-md font-medium text-on-surface">Continue as Guest</span>
					</span>
					<span class="{MONO} bg-surface-container-high border border-surface-glass-border px-2 py-0.5 rounded text-on-surface-variant">Browse Only</span>
				</a>

				<div class="flex flex-col items-center justify-center gap-1 text-center">
					<p class="text-body-md text-on-surface-variant">
						Don't have an account?
						<a class="text-primary font-semibold hover:underline underline-offset-4" href={signupHref}>Sign Up</a>
					</p>
					<p class="{MONO} text-on-surface-variant">Instant gate QR issuance upon zero-friction signup</p>
				</div>
			</div>
		</section>
	</div>

	<footer class="border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</div>
			<div class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</div>
		</div>
	</footer>
</div>

<div class="md:hidden">

<header class="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-space-md md:max-w-lg md:mx-auto flex items-center justify-between">
		<div class="flex items-center gap-space-xs">
			<a href="/" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<h1 class="font-display text-headline-md font-semibold text-on-surface truncate">Login</h1>
		</div>
		<div class="flex items-center gap-2">
			<ThemeToggle size="sm" />
			<img src="/owl-icon.png" alt="Owltside logo" class="h-7 w-7 object-contain opacity-90" />
		</div>
	</div>
</header>

<main class="flex-1 flex flex-col relative w-full pt-mobile-header pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-gutter md:max-w-lg md:mx-auto pb-space-xl">
		<div class="relative w-full rounded-xl bg-surface-container border border-surface-glass-border p-space-lg mt-space-sm mb-space-md">
			<div class="flex flex-col items-center text-center">
				<img src="/logo-stacked.png" alt="Owltside" class="w-24 max-h-18 object-contain mb-space-sm" />
				<p class="font-display text-headline-lg-mobile text-on-surface font-semibold">Welcome back</p>
				<p class="text-body-sm text-outline max-w-[280px] mt-0.5">
					Your instant radar for tonight's music arenas, secret sets, and gate tickets.
				</p>
			</div>
		</div>

		<form method="POST" action="?/sendCode" use:enhance={handleSendCode} class="bg-surface-container border border-surface-glass-border rounded-xl p-space-md flex flex-col gap-space-md">
			<input type="hidden" name="next" value={next} />
			<div class="flex flex-col gap-1.5">
				<label class="text-label-badge uppercase tracking-wider text-outline flex items-center justify-between" for="email-input">
					<span>Email Address</span>
					<span class="text-label-badge text-on-surface opacity-0 transition-opacity {valid ? 'opacity-100' : ''}">Valid</span>
				</label>
				<div class="relative flex items-center">
					<AtSign class="absolute left-3.5 w-5 h-5 text-outline pointer-events-none" />
					<input
						id="email-input"
						name="email"
						type="email"
						inputmode="email"
						required
						placeholder="rave.patron@owltside.io"
						bind:value={email}
						class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-11 pr-10 focus:outline-none focus:border-outline transition-colors"
					/>
					{#if valid}
						<span class="absolute right-3.5 flex items-center justify-center text-accent-emerald">
							<BadgeCheck class="w-[18px] h-[18px]" />
						</span>
					{/if}
				</div>
				{#if form?.error}
					<p class="text-body-sm text-error">{form.error}</p>
				{/if}
				{#if page.url.searchParams.get('error')}
					<p class="text-body-sm text-error">{page.url.searchParams.get('error')}</p>
				{/if}
				<p class="text-body-sm text-outline flex items-center gap-1.5 mt-0.5">
					<Mail class="w-4 h-4 text-on-surface" /> We'll send a 6-digit login verification code to your email.
				</p>
			</div>

			<div class="flex items-center gap-space-xs bg-surface-base border border-surface-glass-border px-3 py-2 rounded-lg">
				<Lock class="w-4 h-4 text-accent-emerald" />
				<span class="text-body-sm text-on-surface-variant truncate">Passwordless & Instant Passcode Authentication</span>
			</div>

			<button
				disabled={submitting || googleLoading}
				class="relative w-full h-12 rounded-lg bg-primary-fixed text-surface-base text-body-lg font-semibold flex items-center justify-center gap-space-xs transition-all active:scale-[0.98] hover:bg-white disabled:opacity-50"
				type="submit"
			>
				{#if submitting}
					<span>Sending code…</span>
				{:else}
					<Send class="w-5 h-5" />
					<span>Send Login Code</span>
				{/if}
			</button>
		</form>

		<div class="relative flex items-center justify-center my-space-md">
			<div class="w-full h-[1px] bg-[#272831]"></div>
			<span class="absolute bg-surface px-space-sm text-label-badge uppercase tracking-wider text-outline">or continue with</span>
		</div>

		<div class="grid grid-cols-1 gap-space-sm mb-space-sm">
			{#if enrolledBiometric || biometricSupported}
				<button
					type="button"
					disabled={submitting || googleLoading || biometricLoading}
					onclick={handleBiometricLogin}
					class="w-full h-12 rounded-lg bg-primary/10 border border-primary/40 text-on-surface text-body-md font-semibold flex items-center justify-center gap-2 hover:bg-primary/15 disabled:opacity-40 transition-colors"
				>
					<Fingerprint class="w-5 h-5 text-primary" />
					<span>
						{biometricLoading
							? 'Verifying biometrics…'
							: enrolledBiometric
								? `Sign in with ${enrolledBiometric.deviceLabel}`
								: 'Sign in with Fingerprint / Face ID'}
					</span>
				</button>
			{/if}
			<form method="POST" action="?/google" use:enhance={handleGoogle}>
				<input type="hidden" name="next" value={next} />
				<button type="submit" disabled={submitting || googleLoading} class="w-full h-12 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md font-semibold flex items-center justify-center gap-2 hover:border-primary/40 disabled:opacity-40">
					{#if googleLoading}
						<span>Connecting to Google…</span>
					{:else}
						<svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z" fill="#EA4335"></path><path d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z" fill="#4285F4"></path><path d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z" fill="#FBBC05"></path><path d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z" fill="#34A853"></path></svg>
						Continue with Google
					{/if}
				</button>
			</form>
		</div>

		<a href="/home" class="w-full h-11 rounded-lg bg-surface-container border border-surface-glass-border hover:border-outline transition-colors text-on-surface-variant flex items-center justify-between px-space-md mb-space-sm">
			<span class="flex items-center gap-space-xs">
				<Compass class="w-5 h-5 text-outline" />
				<span class="text-body-md font-medium text-on-surface">Continue as Guest</span>
			</span>
			<span class="text-label-badge bg-[#222a3d] border border-surface-glass-border px-2 py-0.5 rounded text-outline">Browse Only</span>
		</a>

		<div class="flex flex-col items-center justify-center gap-1 text-center pt-space-xs">
			<p class="text-body-md text-on-surface-variant">
				Don't have an account?
				<a class="text-primary font-semibold hover:underline underline-offset-4" href={signupHref}>Sign Up</a>
			</p>
			<p class="text-body-sm text-outline">Instant gate QR issuance upon zero-friction signup</p>
		</div>
	</div>
</main>
</div>

<script lang="ts">
	import { Fingerprint, LockKeyhole, LogOut } from '@lucide/svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import {
		clearBiometricSessionUnlocked,
		detectBiometricDeviceLabel,
		isBiometricUserCancelledError,
		markBiometricSessionUnlocked,
		readStoredBiometric,
		verifyOrEnrollBiometrics
	} from '$lib/webauthn.client';

	interface GateSession {
		userId: string;
		name: string;
		email?: string;
		handle?: string;
	}

	let {
		session,
		overlay = false,
		startWithSplash = true,
		onUnlocked,
		onBusyChange
	}: {
		session: GateSession;
		overlay?: boolean;
		startWithSplash?: boolean;
		onUnlocked: () => void;
		onBusyChange?: (busy: boolean) => void;
	} = $props();

	let phase = $state<'splash' | 'biometric'>('splash');
	let pct = $state(0);
	let verifying = $state(false);
	let signingOut = $state(false);
	let errorMessage = $state('');
	let autoPrompted = false;

	const deviceLabel = $derived(
		readStoredBiometric(session.userId)?.deviceLabel ?? detectBiometricDeviceLabel()
	);

	$effect(() => {
		if (!startWithSplash) {
			phase = 'biometric';
			return;
		}
		if (phase !== 'splash') return;

		let transitionTimer: ReturnType<typeof setTimeout> | undefined;
		const interval = setInterval(() => {
			pct = Math.min(100, pct + 4 + Math.round(Math.random() * 6));
			if (pct >= 100) {
				clearInterval(interval);
				transitionTimer = setTimeout(() => {
					phase = 'biometric';
				}, 350);
			}
		}, 60);

		return () => {
			clearInterval(interval);
			if (transitionTimer) clearTimeout(transitionTimer);
		};
	});

	$effect(() => {
		if (phase === 'biometric' && !autoPrompted) {
			autoPrompted = true;
			void runBiometricCheck(true);
		}
	});

	async function runBiometricCheck(automatic = false) {
		if (verifying || signingOut) return;
		verifying = true;
		onBusyChange?.(true);
		if (!automatic) errorMessage = '';
		try {
			await verifyOrEnrollBiometrics(session.userId);
			appSettings.value.security.biometricLogin = true;
			markBiometricSessionUnlocked(session.userId);
			onUnlocked();
		} catch (err) {
			const msg =
				err instanceof Error && err.message
					? err.message
					: 'Biometric verification could not be completed.';
			if (automatic && isBiometricUserCancelledError(err)) {
				// Browser required an explicit user tap or prompt was dismissed; keep UI clean for manual tap.
				errorMessage = '';
			} else {
				errorMessage = msg;
				if (!automatic) {
					toast(msg, 'error');
				}
			}
		} finally {
			verifying = false;
			onBusyChange?.(false);
		}
	}

	async function signOutToEmailLogin() {
		if (signingOut) return;
		signingOut = true;
		clearBiometricSessionUnlocked();
		try {
			await fetch('/api/auth/signout', { method: 'POST' });
		} catch {
			// Best-effort network call before navigating to /auth/login
		}
		window.location.assign('/auth/login');
	}
</script>

<div
	class={overlay
		? 'fixed inset-0 z-[100] flex items-center justify-center bg-surface-base px-gutter pt-safe pb-safe'
		: 'min-h-dvh w-full flex items-center justify-center bg-surface-base px-gutter pt-safe pb-safe'}
	data-testid="splash-biometric-gate"
	data-gate-phase={phase}
>
	{#if phase === 'splash'}
		<div class="w-full max-w-[13rem] flex flex-col items-center text-center">
			<img src="/logo-stacked.png" alt="Owltside" class="w-28 max-h-28 object-contain" />
			<p class="font-body text-body-sm text-on-surface-variant mt-3 max-w-[12rem] leading-snug">
				Everything happening around you.
			</p>
			<div
				role="progressbar"
				aria-label="Loading Owltside"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={pct}
				class="w-3/4 mt-5 flex flex-col items-center gap-1.5"
			>
				<div class="w-full h-1 bg-surface-container-high border border-surface-glass-border rounded-full overflow-hidden">
					<div class="h-full bg-primary-fixed rounded-full transition-all duration-300" style="width: {pct}%"></div>
				</div>
				<span class="self-end font-code text-label-badge text-on-surface">{pct}%</span>
			</div>
		</div>
	{:else}
		<div class="w-full max-w-sm rounded-2xl border border-surface-glass-border bg-surface-container p-6 flex flex-col items-center gap-4 text-center shadow-2xl">
			<span class="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
				<Fingerprint class="w-7 h-7" />
			</span>

			<div class="flex flex-col items-center gap-1">
				<span class="font-code text-label-badge uppercase tracking-[0.14em] text-primary">
					{deviceLabel}
				</span>
				<h1 class="font-display text-headline-md text-on-surface font-bold mt-0.5">
					Welcome back{session.name ? `, ${session.name}` : ''}
				</h1>
				<p class="text-body-sm text-on-surface-variant max-w-[18rem]">
					Verify your fingerprint or Face ID to unlock your passes and continue to Owltside.
				</p>
			</div>

			{#if errorMessage}
				<p class="w-full rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error" role="alert">
					{errorMessage}
				</p>
			{/if}

			<button
				type="button"
				disabled={verifying || signingOut}
				onclick={() => runBiometricCheck(false)}
				class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
			>
				<LockKeyhole class="w-4 h-4" />
				<span>{verifying ? 'Verifying biometrics…' : 'Unlock with Fingerprint / Face ID'}</span>
			</button>

			<button
				type="button"
				disabled={verifying || signingOut}
				onclick={signOutToEmailLogin}
				class="w-full h-10 rounded-full border border-surface-glass-border bg-surface-base text-on-surface-variant hover:text-on-surface text-body-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
			>
				<LogOut class="w-4 h-4" />
				<span>{signingOut ? 'Signing out…' : 'Sign out & use email code'}</span>
			</button>
		</div>
	{/if}
</div>

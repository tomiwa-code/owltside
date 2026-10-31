<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Fingerprint, LockKeyhole } from '@lucide/svelte';
	import Toasts from '$components/Toasts.svelte';
	import PullToRefresh from '$components/PullToRefresh.svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { ensureServiceWorkerRegistration } from '$lib/push.client';
	import {
		authenticateWithBiometrics,
		readStoredBiometric
	} from '$lib/webauthn.client';
	import { toast } from '$lib/state/toast.svelte';

	let { children } = $props();
	let biometricLocked = $state(false);
	let biometricUnlocking = $state(false);

	$effect(() => {
		const preferences = appSettings.value.accessibility;
		document.documentElement.dataset.theme = preferences.appearance;
		// Keep the `dark` class and the pre-paint cache in step with the preference
		// so a reload never paints the wrong theme first.
		document.documentElement.classList.toggle('dark', preferences.appearance !== 'light');
		try {
			localStorage.setItem('owltside.theme', preferences.appearance);
		} catch {
			/* storage unavailable — the in-memory preference still applies */
		}
		document.documentElement.style.zoom = `${Math.min(150, Math.max(25, preferences.pageSize || 100))}%`;
		document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
		document.documentElement.dataset.screenReaderLabels = String(preferences.screenReaderLabels);
	});

	async function unlockWithBiometricShield() {
		if (biometricUnlocking) return;
		biometricUnlocking = true;
		try {
			await authenticateWithBiometrics();
			biometricLocked = false;
			toast('Unlocked with biometrics', 'success');
		} catch (err) {
			toast(
				err instanceof Error ? err.message : 'Biometric unlock cancelled.',
				'error'
			);
		} finally {
			biometricUnlocking = false;
		}
	}

	onMount(() => {
		void ensureServiceWorkerRegistration();

		let hiddenAt = 0;
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				hiddenAt = Date.now();
			} else if (
				hiddenAt > 0 &&
				Date.now() - hiddenAt > 5 * 60_000 &&
				appSettings.value.security.biometricLogin &&
				readStoredBiometric()
			) {
				biometricLocked = true;
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});
</script>

<svelte:head>
	<title>Owltside — Events & Tickets</title>
</svelte:head>

<div class="min-h-dvh bg-surface-base text-on-surface font-body">
	{@render children()}
	{#if biometricLocked}
		<div class="fixed inset-0 z-[100] bg-surface-base/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
			<div class="w-full max-w-sm rounded-2xl border border-surface-glass-border bg-surface-container p-6 flex flex-col items-center gap-4 shadow-2xl">
				<span class="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
					<Fingerprint class="w-7 h-7" />
				</span>
				<div>
					<h2 class="font-display text-headline-md text-on-surface font-bold">Owltside Locked</h2>
					<p class="text-body-sm text-on-surface-variant mt-1">
						Verify your fingerprint or Face ID to unlock your passes and account.
					</p>
				</div>
				<button
					type="button"
					disabled={biometricUnlocking}
					onclick={unlockWithBiometricShield}
					class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
				>
					<LockKeyhole class="w-4 h-4" />
					<span>{biometricUnlocking ? 'Verifying…' : 'Unlock with Fingerprint / Face ID'}</span>
				</button>
			</div>
		</div>
	{/if}
	<PullToRefresh />
	<Toasts />
</div>

<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import SplashBiometricGate from '$components/SplashBiometricGate.svelte';
	import Toasts from '$components/Toasts.svelte';
	import PullToRefresh from '$components/PullToRefresh.svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { ensureServiceWorkerRegistration } from '$lib/push.client';
	import {
		clearBiometricSessionUnlocked,
		consumeJustAuthenticatedCookie,
		isBiometricSessionUnlocked,
		isPlatformBiometricAvailable,
		markBiometricSessionUnlocked,
		readStoredBiometric
	} from '$lib/webauthn.client';

	let { children } = $props();

	const session = $derived(page.data.session);
	const onRootOrAuth = $derived(
		page.url.pathname === '/' || page.url.pathname.startsWith('/auth/')
	);

	let biometricGateOpen = $state(false);
	let biometricGateKey = $state(0);
	let biometricBusy = $state(false);
	let checkedUserId = '';

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

	$effect(() => {
		if (!browser) return;

		if (!session) {
			checkedUserId = '';
			biometricGateOpen = false;
			clearBiometricSessionUnlocked();
			return;
		}

		if (onRootOrAuth) {
			biometricGateOpen = false;
			return;
		}

		const uid = session.userId;
		if (consumeJustAuthenticatedCookie(uid) || isBiometricSessionUnlocked(uid)) {
			checkedUserId = uid;
			biometricGateOpen = false;
			return;
		}

		if (readStoredBiometric(uid)) {
			checkedUserId = uid;
			biometricGateOpen = true;
			return;
		}

		if (checkedUserId === uid) return;
		checkedUserId = uid;

		void isPlatformBiometricAvailable().then((res) => {
			if (page.data.session?.userId !== uid) return;
			if (page.url.pathname === '/' || page.url.pathname.startsWith('/auth/')) return;
			if (isBiometricSessionUnlocked(uid)) return;
			if (res.supported) {
				biometricGateOpen = true;
			} else {
				markBiometricSessionUnlocked(uid);
			}
		});
	});

	onMount(() => {
		void ensureServiceWorkerRegistration();

		let hiddenAt = 0;
		let lastFilePickerAt = 0;

		const onDocumentClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest('input[type="file"], label')) {
				const input =
					target instanceof HTMLInputElement
						? target
						: target?.querySelector<HTMLInputElement>('input[type="file"]');
				if (input?.type === 'file') {
					lastFilePickerAt = Date.now();
				}
			}
		};

		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				if (!biometricBusy) {
					hiddenAt = Date.now();
				}
				return;
			}

			if (hiddenAt <= 0 || biometricBusy) return;
			const elapsed = Date.now() - hiddenAt;
			hiddenAt = 0;

			if (Date.now() - lastFilePickerAt < 60_000) return;
			const activeSession = page.data.session;
			if (
				!activeSession ||
				page.url.pathname === '/' ||
				page.url.pathname.startsWith('/auth/')
			) {
				return;
			}

			const isStandalone =
				Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
				Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
			const lockThresholdMs = isStandalone ? 2_000 : 5 * 60_000;
			if (elapsed < lockThresholdMs) return;

			const uid = activeSession.userId;
			if (readStoredBiometric(uid)) {
				clearBiometricSessionUnlocked();
				biometricGateKey += 1;
				biometricGateOpen = true;
				return;
			}

			void isPlatformBiometricAvailable().then((res) => {
				if (!res.supported || page.data.session?.userId !== uid) return;
				clearBiometricSessionUnlocked();
				biometricGateKey += 1;
				biometricGateOpen = true;
			});
		};

		document.addEventListener('click', onDocumentClick, true);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('click', onDocumentClick, true);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<svelte:head>
	<title>Owltside — Events & Tickets</title>
</svelte:head>

<div class="min-h-dvh bg-surface-base text-on-surface font-body">
	{@render children()}
	{#if biometricGateOpen && session && !onRootOrAuth}
		{#key biometricGateKey}
			<SplashBiometricGate
				{session}
				overlay={true}
				startWithSplash={true}
				onBusyChange={(busy) => {
					biometricBusy = busy;
				}}
				onUnlocked={() => {
					biometricGateOpen = false;
				}}
			/>
		{/key}
	{/if}
	<PullToRefresh />
	<Toasts />
</div>

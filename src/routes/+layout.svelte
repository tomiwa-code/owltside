<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Toasts from '$components/Toasts.svelte';
	import PullToRefresh from '$components/PullToRefresh.svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { ensureServiceWorkerRegistration } from '$lib/push.client';
	import { clearRetiredBiometricStorage } from '$lib/retired-biometrics.client';

	let { children } = $props();

	$effect(() => {
		const preferences = appSettings.value.accessibility;
		document.documentElement.dataset.theme = preferences.appearance;
		// Keep the `dark` class and the pre-paint cache in step with the preference
		// so a reload never paints the wrong theme first.
		document.documentElement.classList.toggle('dark', preferences.appearance === 'dark');
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preferences.appearance === 'dark' ? '#1A1A1A' : '#f8f9ff');
		try {
			localStorage.setItem('owltside.theme', preferences.appearance);
		} catch {
			/* storage unavailable — the in-memory preference still applies */
		}
		document.documentElement.style.zoom = `${Math.min(150, Math.max(25, preferences.pageSize || 100))}%`;
		document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
		document.documentElement.dataset.screenReaderLabels = String(preferences.screenReaderLabels);
	});

	onMount(() => {
		clearRetiredBiometricStorage();
		void ensureServiceWorkerRegistration();
	});
</script>

<svelte:head>
	<title>Owltside — Events & Tickets</title>
</svelte:head>

<div class="min-h-dvh bg-surface-base text-on-surface font-body">
	{@render children()}
	<PullToRefresh />
	<Toasts />
</div>

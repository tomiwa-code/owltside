<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Toasts from '$components/Toasts.svelte';
	import PullToRefresh from '$components/PullToRefresh.svelte';
	import { appSettings } from '$lib/state/settings.svelte';

	let { children } = $props();

	$effect(() => {
		const preferences = appSettings.value.accessibility;
		document.documentElement.dataset.theme = preferences.appearance;
		document.documentElement.style.zoom = `${Math.min(150, Math.max(25, preferences.pageSize || 100))}%`;
		document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
		document.documentElement.dataset.screenReaderLabels = String(preferences.screenReaderLabels);
	});

	onMount(() => {
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {});
		}
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

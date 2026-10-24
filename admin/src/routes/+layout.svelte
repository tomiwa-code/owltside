<script lang="ts">
	import '../app.css';
	import Toasts from '$components/Toasts.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Owltside Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}
<Toasts />

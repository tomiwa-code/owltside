<script lang="ts">
	import { page } from '$app/state';
	import { Compass } from '@lucide/svelte';
</script>

<main class="min-h-dvh bg-surface-base flex flex-col items-center justify-center gap-4 px-6 text-center">
	<div class="w-16 h-16 rounded-2xl bg-surface-container border border-surface-glass-border flex items-center justify-center">
		<Compass class="w-8 h-8 text-primary" />
	</div>
	<h1 class="font-display text-display-hero-mobile text-on-surface">{page.status}</h1>
	<p class="text-body-md text-on-surface-variant max-w-xs">
		{page.status === 404
			? 'This corner of the night is dark. The page you want isn\u2019t on the list.'
			: 'Something misfired behind the curtain. Try again in a moment.'}
	</p>
	<a href="/home" class="h-11 px-6 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center">
		Back to the feed
	</a>
</main>

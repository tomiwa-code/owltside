<script lang="ts">
	import { navigating } from '$app/state';
</script>

<!-- Match the public app's thin, pulsing navigation line. Keep it above the
     console shell and overlays, without shifting content or blocking clicks. -->
{#if navigating.to}
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-[110] h-0.5 animate-pulse bg-accent motion-reduce:animate-none"
		role="status"
		aria-label="Loading page"
	></div>
{/if}

<script lang="ts">
	import { page } from '$app/state';
	import BottomNav from '$components/BottomNav.svelte';

	let { children } = $props();

	/**
	 * The desktop (md+) home feed renders its own full-width top bar per the
	 * desktop design source, so the shared side rail is skipped there. Every
	 * other route keeps the rail on desktop; mobile is unchanged everywhere.
	 */
	const homeShell = $derived(page.url.pathname === '/home' || page.url.pathname.startsWith('/home/'));
</script>

<div class="md:pl-20" class:md:pl-0={homeShell}>
	{@render children()}
	<BottomNav railOnDesktop={!homeShell} />
</div>

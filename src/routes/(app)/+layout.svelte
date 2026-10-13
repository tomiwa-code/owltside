<script lang="ts">
	import { page } from '$app/state';
	import BottomNav from '$components/BottomNav.svelte';

	let { children } = $props();

	/**
	 * Routes whose desktop (md+) design source carries its own full-width top
	 * bar (home feed, checkout node) skip the shared side rail there. Every
	 * other route keeps the rail on desktop; mobile is unchanged everywhere.
	 */
	const fullBleedDesktop = $derived(
		['/home', '/checkout', '/organizer/create', '/events', '/explore', '/inbox', '/notifications', '/organizer', '/settings'].some((r) =>
			page.url.pathname === r || page.url.pathname.startsWith(r + '/')
		) &&
			!['/organizer/scan', '/organizer/events'].some(
				(r) => page.url.pathname === r || page.url.pathname.startsWith(r + '/')
			)
	);
</script>

<div class="md:pl-20" class:md:pl-0={fullBleedDesktop}>
	{@render children()}
	<BottomNav railOnDesktop={!fullBleedDesktop} />
</div>

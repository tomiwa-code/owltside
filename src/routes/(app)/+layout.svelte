<script lang="ts">
	import { page } from '$app/state';
	import BottomNav from '$components/BottomNav.svelte';

	let { children, data } = $props();

	/**
	 * Routes whose desktop (md+) design source carries its own full-width top
	 * bar (home feed, checkout node) skip the shared side rail there. Every
	 * other route keeps the rail on desktop; mobile is unchanged everywhere.
	 */
	const fullBleedDesktop = $derived(
		['/home', '/checkout', '/organizer/create', '/events', '/explore', '/inbox', '/notifications', '/organizer', '/settings', '/profile', '/tickets', '/users'].some((r) =>
			page.url.pathname === r || page.url.pathname.startsWith(r + '/')
		) &&
			!['/organizer/events'].some(
				(r) => page.url.pathname === r || page.url.pathname.startsWith(r + '/')
			) &&
			!page.url.pathname.startsWith('/tickets/')
	);
	const hideMobileBottomNav = $derived(
		page.url.pathname === '/checkout' ||
			page.url.pathname.startsWith('/checkout/') ||
			page.url.pathname === '/organizer/create' ||
			page.url.pathname.startsWith('/organizer/create/') ||
			page.url.pathname.startsWith('/inbox/') ||
			(/^\/events\/[^/]+$/.test(page.url.pathname))
	);
</script>

<div class="md:pl-20" class:md:pl-0={fullBleedDesktop} data-operating-identity={data.operatingIdentity ?? 'attendee'}>
	{@render children()}
	<BottomNav railOnDesktop={!fullBleedDesktop} mobileHidden={hideMobileBottomNav} operatingIdentity={data.operatingIdentity ?? 'attendee'} />
</div>

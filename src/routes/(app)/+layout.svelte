<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$components/AppHeader.svelte';
	import BottomNav from '$components/BottomNav.svelte';

	let { children, data } = $props();

	const hideMobileBottomNav = $derived(
		page.url.pathname === '/checkout' ||
			page.url.pathname.startsWith('/checkout/') ||
			page.url.pathname === '/organizer/create' ||
			page.url.pathname.startsWith('/organizer/create/') ||
			page.url.pathname.startsWith('/inbox/') ||
			(/^\/events\/[^/]+$/.test(page.url.pathname))
	);
</script>

<AppHeader />
<div class="app-content" data-operating-identity={data.operatingIdentity ?? 'attendee'}>
	{@render children()}
	<BottomNav railOnDesktop={false} mobileHidden={hideMobileBottomNav} operatingIdentity={data.operatingIdentity ?? 'attendee'} />
</div>

<style>
.app-content { padding-top: calc(4rem + env(safe-area-inset-top)); }
</style>

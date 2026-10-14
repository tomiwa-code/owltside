<script lang="ts">
	import { page } from '$app/state';
	import { BarChart3, CircleUser, Compass, Sparkles, Ticket } from '@lucide/svelte';
	import type { OperatingIdentity } from '$lib/constants/operating-identity';

	/**
	 * Mobile bottom nav. On desktop (md+) it becomes the left icon rail,
	 * unless `railOnDesktop` is false — routes with their own desktop top bar
	 * (the desktop home feed) keep it mobile-only.
	 */
	let {
		railOnDesktop = true,
		mobileHidden = false,
		operatingIdentity = 'attendee'
	}: { railOnDesktop?: boolean; mobileHidden?: boolean; operatingIdentity?: OperatingIdentity } = $props();

	const items = [
		{ href: '/home', label: 'Home', icon: Sparkles },
		{ href: '/explore', label: 'Explore', icon: Compass },
		{ href: '/tickets', label: 'Tickets', icon: Ticket },
		{ href: '/organizer', label: 'Organizer', icon: BarChart3 },
		{ href: '/profile', label: 'Profile', icon: CircleUser }
	];

	const organizerEnabled = $derived(operatingIdentity === 'organizer');
	const active = $derived((href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/')
	);
</script>

<nav
	class="fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface/80 backdrop-blur-xl border-t border-surface-glass-border
		{mobileHidden
			? 'hidden md:hidden'
			: railOnDesktop
				? 'md:inset-x-auto md:left-0 md:top-0 md:bottom-0 md:w-20 md:border-t-0 md:border-r md:pt-safe'
				: 'md:hidden'}"
	aria-label="Primary"
>
	<div class="flex justify-around items-center h-16 px-space-xs md:h-full md:flex-col md:justify-start md:gap-2 md:pt-6">
		{#each items as item}
			{#if item.href !== '/organizer' || organizerEnabled}
				{@const isActive = active(item.href)}
				<a
					href={item.href}
					aria-current={isActive ? 'page' : undefined}
					class="flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-11 md:w-14 md:h-14 md:rounded-xl transition-colors
						{isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
				>
					<item.icon class="w-[22px] h-[22px]" fill={isActive ? 'currentColor' : 'none'} fill-opacity={isActive ? 0.25 : 0} />
					<span class="text-label-badge">{item.label}</span>
					<span class="md:hidden w-1 h-1 rounded-full {isActive ? 'bg-primary' : 'bg-transparent'}"></span>
				</a>
			{/if}
		{/each}
	</div>
</nav>

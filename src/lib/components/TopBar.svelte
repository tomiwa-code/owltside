<script lang="ts">
	import { ArrowLeft, Bell, Inbox, MoreVertical, Settings2, UserCircle, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		back = false,
		right
	}: { title?: string; subtitle?: string; back?: boolean; right?: Snippet } = $props();

	let menuOpen = $state(false);

	const quickLinks = [
		{ href: '/inbox', label: 'Inbox', icon: Inbox },
		{ href: '/notifications', label: 'Notifications', icon: Bell },
		{ href: '/profile', label: 'Profile', icon: UserCircle },
		{ href: '/settings', label: 'Settings', icon: Settings2 }
	];
</script>

<header class="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-gutter md:max-w-5xl md:mx-auto flex items-center justify-between gap-space-sm">
		<div class="flex items-center gap-space-xs min-w-0">
			{#if back}
				<button
					aria-label="Back"
					onclick={() => history.back()}
					class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors"
				>
					<ArrowLeft class="w-5 h-5" />
				</button>
			{/if}
			<div class="min-w-0">
				{#if title}
					<h1 class="font-display text-headline-md text-on-surface truncate leading-none">{title}</h1>
				{/if}
				{#if subtitle}
					<span class="block text-label-badge text-on-surface-variant leading-none pt-1 truncate">{subtitle}</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-space-xs shrink-0">
			{#if right}
				<div class="flex items-center gap-space-xs">{@render right()}</div>
			{/if}
			<div class="relative">
				<button
					aria-label={menuOpen ? 'Close quick links' : 'Open quick links'}
					aria-expanded={menuOpen}
					aria-controls="topbar-quick-links"
					onclick={() => (menuOpen = !menuOpen)}
					class="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
				>
					{#if menuOpen}<X class="w-5 h-5" />{:else}<MoreVertical class="w-5 h-5" />{/if}
				</button>
				{#if menuOpen}
					<nav
						id="topbar-quick-links"
						aria-label="Quick links"
						class="absolute right-0 top-12 z-[60] w-56 rounded-2xl border border-surface-glass-border bg-surface-container-high p-2 shadow-2xl"
					>
						{#each quickLinks as link (link.href)}
							<a
								href={link.href}
								onclick={() => (menuOpen = false)}
								class="flex items-center gap-3 rounded-xl px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-highest transition-colors"
							>
								<link.icon class="w-4 h-4 text-primary" />
								<span>{link.label}</span>
							</a>
						{/each}
					</nav>
				{/if}
			</div>
		</div>
	</div>
</header>

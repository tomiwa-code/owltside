<script lang="ts">
	import { enhance } from '$app/forms';
	import { Bell, CheckCheck, Flame, MessageSquare, QrCode, Settings2, Ticket } from '@lucide/svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { useQuery, queryClient } from '$lib/state/query.svelte';
	import { fmtRelative } from '$lib/utils/dates';
	import type { NotificationItem } from '$lib/types';

	let { data } = $props();

	const items = useQuery<NotificationItem[]>(
		'notifications:mine',
		async () => (await fetch('/api/notifications')).json(),
		{ staleTime: 15_000, refetchInterval: 30_000 },
		data.items
	);

	let filter = $state<'all' | 'gate' | 'drops' | 'messages'>('all');

	const kindToFilter: Record<NotificationItem['kind'], string> = {
		ticket: 'gate',
		system: 'gate',
		event: 'drops',
		promo: 'drops',
		social: 'messages'
	};
	const iconFor: Record<NotificationItem['kind'], any> = {
		ticket: QrCode,
		system: Settings2,
		event: Flame,
		promo: Ticket,
		social: MessageSquare
	};
	const colorFor: Record<NotificationItem['kind'], string> = {
		ticket: 'bg-tertiary-container text-on-tertiary-container',
		system: 'bg-surface-container-highest text-on-surface',
		event: 'bg-secondary-container text-on-secondary-container',
		promo: 'bg-primary-container text-on-primary-container',
		social: 'bg-accent-emerald/20 text-accent-emerald'
	};

	const list = $derived((items.data ?? []).filter((n) => filter === 'all' || kindToFilter[n.kind] === filter));
	const unread = $derived((items.data ?? []).filter((n) => !n.read).length);
</script>

<svelte:head><title>Activity Hub • Owltside</title></svelte:head>

<TopBar title="Activity Hub" subtitle="Passes, drops & messages" />

<main class="flex-1 flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-2xl md:mx-auto pb-8">
		<div class="px-space-md pt-space-md pb-space-sm flex items-center justify-between">
			<div class="flex items-center gap-space-xs">
				<span class="font-display text-headline-md text-on-surface">Activity Hub</span>
				{#if unread > 0}
					<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-label-badge tracking-wider">{unread} NEW</span>
				{/if}
			</div>
			<form method="POST" action="?/markAll" use:enhance={() => async ({ result }) => {
				if (result.type === 'success') queryClient.invalidate('notifications');
			}}>
				<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-bright text-primary text-body-sm transition-all active:scale-95">
					<CheckCheck class="w-4 h-4" /><span>Mark all as read</span>
				</button>
			</form>
		</div>

		<div class="w-full overflow-x-auto px-space-md py-space-xs flex gap-space-xs scrollbar-none">
			{#each [['all', 'All Notifications'], ['gate', 'Gate & Passes'], ['drops', 'Event Drops'], ['messages', 'Messages']] as [id, label]}
				<button
					class="whitespace-nowrap px-4 py-2 rounded-full text-body-sm transition-all {filter === id ? 'bg-primary-container text-on-primary font-medium shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (filter = id as typeof filter)}
				>
					{label}
				</button>
			{/each}
		</div>

		<div class="flex flex-col gap-space-sm px-space-md mt-space-md">
			{#each list as n (n.id)}
				{@const Icon = iconFor[n.kind]}
				<div class="relative p-space-md rounded-xl bg-surface-container transition-all hover:bg-surface-container-high">
					<div class="flex items-start gap-space-sm">
						<div class="relative shrink-0">
							<div class="w-11 h-11 rounded-full flex items-center justify-center shadow-md {colorFor[n.kind]}">
								<Icon class="w-6 h-6" />
							</div>
							{#if !n.read}
								<span class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-tertiary ring-2 ring-surface-container animate-pulse"></span>
							{/if}
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between gap-2">
								<span class="font-display text-body-lg font-bold text-on-surface truncate">{n.title}</span>
								<span class="shrink-0 text-body-sm text-on-surface-variant">{fmtRelative(n.at)}</span>
							</div>
							<p class="text-body-md text-on-surface-variant mt-1">{n.body}</p>
						</div>
					</div>
				</div>
			{:else}
				<EmptyState title="All quiet" sub="New passes, drops and replies will land here.">
					{#snippet icon()}<Bell class="w-6 h-6" />{/snippet}
				</EmptyState>
			{/each}
		</div>
	</div>
</main>

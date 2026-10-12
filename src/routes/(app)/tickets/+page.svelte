<script lang="ts">
	import { goto } from '$app/navigation';
	import { CloudCheck, History, Ticket as TicketIcon } from '@lucide/svelte';
	import Cover from '$components/Cover.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import Avatar from '$components/Avatar.svelte';
	import { page } from '$app/state';
	import { useQuery } from '$lib/state/query.svelte';
	import { fmtDateFull, fmtTime } from '$lib/utils/dates';
	import type { Ticket } from '$lib/types';

	let { data } = $props();

	const tickets = useQuery<Ticket[]>(
		'tickets:mine',
		async () => (await fetch('/api/tickets')).json(),
		{ staleTime: 15_000 },
		data.tickets
	);

	let tab = $state<'upcoming' | 'past'>('upcoming');

	const all = $derived(tickets.data ?? []);
	const upcoming = $derived(all.filter((t) => t.status === 'valid' && new Date(t.eventStartsAt) > new Date()));
	const past = $derived(all.filter((t) => !upcoming.includes(t)));
	const shown = $derived(tab === 'upcoming' ? upcoming : past);
</script>

<svelte:head><title>Ticket Wallet • Owltside</title></svelte:head>

<TopBar title="Ticket Wallet" subtitle="Offline gate passes" />

<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-margin md:max-w-2xl md:mx-auto pb-10 gap-space-md pt-space-sm">
		<!-- offline pill -->
		<div class="flex items-center justify-between bg-surface-container-high px-space-md py-2.5 rounded-full shadow-sm">
			<div class="flex items-center gap-space-sm min-w-0">
				<span class="relative flex h-2.5 w-2.5">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
					<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span>
				</span>
				<div class="flex flex-col min-w-0">
					<span class="text-label-badge text-on-surface uppercase tracking-wider font-semibold truncate">Offline Gate Ready</span>
					<span class="text-body-sm text-on-surface-variant truncate">Cached offline • HMAC keys fresh</span>
				</div>
			</div>
			<span class="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full shrink-0">
				<CloudCheck class="w-4 h-4 text-accent-emerald" />
				<span class="text-label-badge text-accent-emerald">SECURE</span>
			</span>
		</div>

		<!-- segmented tabs -->
		<div class="bg-surface-container-lowest p-1 rounded-full flex items-center shadow-inner">
			<button
				class="flex-1 py-2 rounded-full text-label-badge transition-all duration-200 flex items-center justify-center gap-1.5 {tab === 'upcoming' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
				onclick={() => (tab = 'upcoming')}
			>
				<TicketIcon class="w-4 h-4" /> Upcoming ({upcoming.length})
			</button>
			<button
				class="flex-1 py-2 rounded-full text-label-badge transition-all duration-200 flex items-center justify-center gap-1.5 {tab === 'past' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
				onclick={() => (tab = 'past')}
			>
				<History class="w-4 h-4" /> Past ({past.length})
			</button>
		</div>

		{#each shown as ticket (ticket.id)}
			{@const isPast = tab === 'past'}
			<button
				class="relative bg-surface-raised rounded-xl overflow-hidden shadow-xl text-left w-full hover:bg-surface-container-high transition-colors {isPast ? 'opacity-70' : ''}"
				onclick={() => goto(`/tickets/${ticket.id}`)}
			>
				<div class="relative h-32 w-full overflow-hidden">
					<Cover cover={ticket.cover} class="w-full h-full" iconClass="w-10 h-10 text-white/30" />
					<div class="absolute inset-0 bg-gradient-to-t from-surface-raised via-transparent to-transparent"></div>
					<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-surface-container-lowest/80 backdrop-blur text-label-badge text-on-surface">
						{ticket.tierName}
					</span>
					{#if isPast}
						<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-surface-container-highest/90 text-label-badge text-on-surface-variant uppercase">{ticket.status}</span>
					{:else}
						<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-accent-emerald/90 text-label-badge text-surface-base font-bold">ACTIVE</span>
					{/if}
				</div>
				<div class="p-space-md flex flex-col gap-1">
					<span class="font-display text-headline-md text-on-surface truncate">{ticket.eventTitle}</span>
					<span class="text-body-sm text-on-surface-variant">{fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)}</span>
					<span class="text-body-sm text-on-surface-variant">{ticket.venue}</span>
					<div class="flex items-center justify-between pt-2">
						<span class="font-code text-label-code text-tertiary tracking-wider">{ticket.code}</span>
						<span class="text-label-badge text-primary">Tap for gate pass →</span>
					</div>
				</div>
			</button>
		{:else}
			<EmptyState title={tab === 'upcoming' ? 'No upcoming passes' : 'No history yet'} sub="Grab a pass and it will mint here instantly with a rotating gate QR.">
				{#snippet icon()}<TicketIcon class="w-6 h-6" />{/snippet}
				{#snippet action()}
					<a href="/explore" class="h-11 px-6 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center">Explore events</a>
				{/snippet}
			</EmptyState>
		{/each}
	</div>
</main>

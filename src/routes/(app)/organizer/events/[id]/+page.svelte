<script lang="ts">
	import {
		ArrowLeft,
		Download,
		UserCheck,
		Megaphone,
		ScanBarcode,
		Receipt,
		Users
	} from '@lucide/svelte';
	import Sheet from '$components/Sheet.svelte';
	import { formatMoney } from '$lib/utils/money';
	import { fmtDateTime, fmtRelative } from '$lib/utils/dates';
	import { downloadCsv, ticketsToCsv } from '$lib/utils/csv';
	import { toast } from '$lib/state/toast.svelte';
	import type { Snippet } from 'svelte';

	let { data } = $props();

	let tab = $state<'attendees' | 'orders' | 'log'>('attendees');
	let broadcastOpen = $state(false);
	let msg = $state('');

	const tabs: { id: typeof tab; label: string; icon: Snippet }[] = $derived([
		{ id: 'attendees', label: 'Attendees', icon: iconUsers },
		{ id: 'orders', label: 'Orders', icon: iconOrders },
		{ id: 'log', label: 'Check-in log', icon: iconLog }
	]);
	const revenue = $derived(data.orders.reduce((s, o) => s + o.total, 0));
</script>

<svelte:head><title>{data.event.title} • Manage • Owltside</title></svelte:head>

<main class="flex flex-col relative w-full pt-3 pb-28 md:pb-16 bg-surface min-h-dvh">
	<!-- top bar -->
	<header class="fixed top-0 left-0 w-full z-30 bg-surface/85 backdrop-blur-xl border-b border-surface-glass-border">
		<div class="flex items-center px-gutter h-16 md:max-w-3xl md:mx-auto w-full gap-2">
			<a href="/organizer" aria-label="Back to console" class="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
				<ArrowLeft class="w-5.5 h-5.5" />
			</a>
			<div class="flex flex-col flex-1 min-w-0">
				<h1 class="font-display text-headline-md text-on-surface truncate leading-tight">{data.event.title}</h1>
				<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Event management</span>
			</div>
			<a href="/organizer/scan" aria-label="Open scanner" class="w-11 h-11 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface hover:bg-surface-bright transition-colors">
				<ScanBarcode class="w-5 h-5" />
			</a>
		</div>
	</header>

	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md pt-18">
		<!-- mini stats -->
		<div class="grid grid-cols-3 gap-2">
			<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
				<p class="font-display text-headline-md-mobile text-on-surface">{data.tickets.length}</p>
				<p class="text-label-badge text-on-surface-variant uppercase">Tickets</p>
			</div>
			<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
				<p class="font-display text-headline-md-mobile text-accent-emerald">{data.checkins.filter((c) => c.result === 'verified').length}</p>
				<p class="text-label-badge text-on-surface-variant uppercase">Checked in</p>
			</div>
			<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
				<p class="font-display text-headline-md-mobile text-on-surface">{formatMoney(revenue)}</p>
				<p class="text-label-badge text-on-surface-variant uppercase">Revenue</p>
			</div>
		</div>

		<!-- tabs -->
		<div role="tablist" class="flex gap-1 p-1 rounded-full bg-surface-container border border-surface-glass-border overflow-x-auto no-scrollbar">
			{#each tabs as t (t.id)}
				<button
					role="tab"
					aria-selected={tab === t.id}
					class="flex-1 min-w-max px-4 py-2.5 rounded-full text-body-sm font-medium flex items-center gap-1.5 transition-all {tab === t.id ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-on-surface-variant'}"
					onclick={() => (tab = t.id)}
				>
					{@render t.icon()} {t.label}
				</button>
			{/each}
		</div>

		{#if tab === 'attendees'}
			<div class="flex items-center justify-between mb-2">
				<p class="text-body-sm text-on-surface-variant">{data.tickets.length} tickets issued</p>
				<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-label-badge font-semibold" onclick={() => { downloadCsv(`${data.event.slug}-attendees.csv`, ticketsToCsv(data.tickets)); toast('CSV exported'); }}>
					<Download class="w-3.5 h-3.5" /> Export CSV
				</button>
			</div>
			<div class="flex flex-col gap-2">
				{#each data.tickets as t (t.id)}
					<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-xl p-3">
						<div class="min-w-0">
							<p class="text-body-md text-on-surface font-medium truncate">{t.holder}</p>
							<p class="text-body-sm text-on-surface-variant font-code truncate">{t.code}</p>
						</div>
						<div class="flex flex-col items-end gap-1 flex-shrink-0">
							<span class="text-body-sm text-on-surface">{t.tierName}</span>
							<span class="px-2 py-0.5 rounded-full text-label-badge border {t.status === 'used' ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' : 'bg-surface-container-highest border-outline-variant/30 text-on-surface-variant'}">
								{t.status === 'used' ? 'Checked in' : t.status === 'refunded' ? 'Refunded' : 'Active'}
							</span>
						</div>
					</div>
				{:else}
					<p class="text-body-sm text-on-surface-variant">No tickets sold yet.</p>
				{/each}
			</div>
		{:else if tab === 'orders'}
			<div class="flex flex-col gap-2">
				{#each data.orders as o (o.id)}
					<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-xl p-3">
						<div class="min-w-0">
							<p class="text-body-sm text-on-surface font-code">{o.reference}</p>
							<p class="text-label-badge text-on-surface-variant">{fmtDateTime(o.at)} • {o.buyer} • {o.itemsLabel}</p>
						</div>
						<div class="flex flex-col items-end gap-1 flex-shrink-0">
							<p class="text-body-md text-on-surface font-semibold">{formatMoney(o.total)}</p>
							<span class="px-2 py-0.5 rounded-full text-label-badge border {o.status === 'refunded' ? 'bg-error/10 border-error/30 text-error' : 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'}">
								{o.status === 'refunded' ? 'Refunded' : 'Paid'}
							</span>
						</div>
					</div>
				{:else}
					<p class="text-body-sm text-on-surface-variant">No orders yet.</p>
				{/each}
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each data.checkins as c (c.id)}
					<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-xl p-3">
						<div class="min-w-0">
							<p class="text-body-md text-on-surface font-medium truncate">{c.holder}</p>
							<p class="text-label-badge text-on-surface-variant">{c.gate} • {fmtRelative(c.at)}</p>
						</div>
						<span class="px-2 py-0.5 rounded-full text-label-badge border capitalize {c.result === 'verified' ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' : c.result === 'duplicate' ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber' : 'bg-error/10 border-error/30 text-error'}">
							{c.result}
						</span>
					</div>
				{:else}
					<p class="text-body-sm text-on-surface-variant">No scans recorded yet.</p>
				{/each}
			</div>
		{/if}

		<button onclick={() => (broadcastOpen = true)} class="w-full h-12 rounded-full bg-surface-container-high border border-outline-variant/40 text-on-surface text-body-md font-medium flex items-center justify-center gap-2">
			<Megaphone class="w-4 h-4 text-accent-amber" /> Broadcast to ticket holders
		</button>
	</div>
</main>

<Sheet open={broadcastOpen} title="Broadcast" close={() => (broadcastOpen = false)}>
	{#snippet footer()}
		<button class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md disabled:opacity-40" disabled={!msg.trim()} onclick={() => { broadcastOpen = false; toast('Broadcast queued', 'success'); msg = ''; }}>
			Send broadcast
		</button>
	{/snippet}
	<textarea bind:value={msg} rows="4" placeholder="Write an announcement…" class="px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
</Sheet>

{#snippet iconUsers()}<Users class="w-4 h-4" />{/snippet}
{#snippet iconOrders()}<Receipt class="w-4 h-4" />{/snippet}
{#snippet iconLog()}<UserCheck class="w-4 h-4" />{/snippet}

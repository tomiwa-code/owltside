<script lang="ts">
	import {
		ArrowUpRight,
		Bell,
		CalendarDays,
		ClipboardCheck,
		Flag,
		Receipt,
		RefreshCw,
		RotateCcw,
		Search,
		Wallet
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$components/PageHeader.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import { dateTime, num, relative } from '$admin/utils/format';
	import type { AdminNotificationItem } from '$admin/types';

	let { data } = $props();

	let filter = $state<'all' | 'actionable' | 'verification' | 'payout' | 'refund' | 'report' | 'event' | 'order'>('all');
	let query = $state('');
	let refreshing = $state(false);

	const items = $derived<AdminNotificationItem[]>(data.bundle.items);
	const counts = $derived(data.bundle.counts);

	const filtered = $derived(
		items
			.filter((item) => {
				if (filter === 'all') return true;
				if (filter === 'actionable') return item.actionable;
				return item.kind === filter;
			})
			.filter((item) => {
				const q = query.trim().toLowerCase();
				if (!q) return true;
				return `${item.title} ${item.body} ${item.actor} ${item.kind} ${item.status}`
					.toLowerCase()
					.includes(q);
			})
	);

	async function reload() {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	}

	function badgeTone(item: AdminNotificationItem): string {
		if (!item.actionable) return 'chip chip-ok';
		if (item.kind === 'report') return 'chip chip-danger';
		if (item.kind === 'refund' || item.kind === 'payout') return 'chip chip-warn';
		return 'chip chip-accent';
	}
</script>

<svelte:head><title>Notifications & Request Feed · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Notifications & Submitted Requests"
		subtitle="Every approval request (KYC ID, payout bank, phone, instant payout, ticket refund), content report, event submission, and order submitted from the public app."
		crumbs={['overview', 'notifications']}
		eyebrow={`${counts.actionable} awaiting review`}
	>
		{#snippet actions()}
			<button type="button" class="btn btn-sm" disabled={refreshing} onclick={reload}>
				<RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} /> Refresh feed
			</button>
			<a href="/approvals" class="btn btn-sm btn-primary">
				<ClipboardCheck size={12} /> Open Approvals Queue
			</a>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
		<div class="panel p-4">
			<p class="mono-label">Action required</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none {counts.actionable > 0 ? 'text-amber-200' : 'text-emerald-300'}">{num(counts.actionable)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Pending admin review</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">KYC & Payouts</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.verifications + counts.payouts)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{counts.verifications} KYC/bank · {counts.payouts} payouts</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Refund requests</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.refunds)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Ticket return requests</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Content reports</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.reports)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Flagged events & profiles</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Event submissions</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.events)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Moderation & status changes</p>
		</div>
	</div>

	<div class="panel overflow-hidden">
		<div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#25252d] px-3.5 py-2.5">
			<div class="flex flex-wrap items-center gap-1">
				{#each [
					['all', `All (${counts.all})`],
					['actionable', `Pending (${counts.actionable})`],
					['verification', `KYC & Bank (${counts.verifications})`],
					['payout', `Payouts (${counts.payouts})`],
					['refund', `Refunds (${counts.refunds})`],
					['report', `Reports (${counts.reports})`],
					['event', `Events (${counts.events})`],
					['order', `Orders (${counts.orders})`]
				] as [key, label]}
					<button
						type="button"
						onclick={() => (filter = key as typeof filter)}
						class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors {filter === key
							? 'bg-[#7c60f6]/18 text-[#e4deff] ring-1 ring-[#7c60f6]/40'
							: 'text-[#8c8c99] hover:text-[#d0d0da]'}"
					>
						{label}
					</button>
				{/each}
			</div>

			<div class="relative w-full sm:w-64">
				<Search size={13} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e6e7a]" />
				<input
					class="input input-sm pl-8"
					placeholder="Filter by requester, event, code…"
					bind:value={query}
				/>
			</div>
		</div>

		{#if filtered.length === 0}
			<EmptyState
				title="No matching notifications"
				message="Submitted approvals, KYC documents, bank verifications, payouts, refunds, reports, and events will appear here."
			/>
		{:else}
			<div class="divide-y divide-[#23232b]">
				{#each filtered as item (item.id)}
					<a
						href={item.href}
						class="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-[#1a1a22] sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex min-w-0 items-start gap-3">
							<span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2f2f39] bg-[#16161d] text-[#c6bcff]">
								{#if item.kind === 'refund'}
									<RotateCcw size={14} />
								{:else if item.kind === 'payout'}
									<Wallet size={14} />
								{:else if item.kind === 'report'}
									<Flag size={14} />
								{:else if item.kind === 'event'}
									<CalendarDays size={14} />
								{:else if item.kind === 'order'}
									<Receipt size={14} />
								{:else}
									<ClipboardCheck size={14} />
								{/if}
							</span>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class={badgeTone(item)}>{item.kind} · {item.status}</span>
									<span class="font-code text-[9.5px] text-[#7f7f8c]">
										{relative(item.createdAt)} · {dateTime(item.createdAt)}
									</span>
								</div>
								<p class="mt-1 text-[13px] font-medium text-[#ededf4]">{item.title}</p>
								<p class="mt-0.5 text-[12px] text-[#9b9ba8]">{item.body}</p>
								<p class="mt-1 font-code text-[10px] text-[#787886]">Submitted by: {item.actor}</p>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2 self-end sm:self-center">
							<span class="btn btn-xs {item.actionable ? 'btn-primary' : ''}">
								{item.actionable ? 'Review now' : 'Open'} <ArrowUpRight size={11} />
							</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

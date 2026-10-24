<script lang="ts">
	import {
		ArrowUpRight,
		CalendarDays,
		CornerDownLeft,
		Flag,
		Search,
		ShieldAlert,
		Ticket,
		Users,
		Wallet
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { chipClass, orderStatus, ticketStatus } from '$admin/utils/status';
	import { money, num, relative, shortDate } from '$admin/utils/format';
	import type { SearchHudResults } from '$admin/server/store';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import EmptyState from '$components/EmptyState.svelte';

	let { data } = $props();

	let query = $state('');
	$effect(() => {
		query = data.q;
	});
	let tab = $state<'all' | 'users' | 'events' | 'tickets' | 'orders'>('all');
	let input: HTMLInputElement | undefined = $state();

	const results = $derived<SearchHudResults>(data.results);
	const totals = $derived({
		users: results.users.length,
		events: results.events.length,
		tickets: results.tickets.length,
		orders: results.orders.length
	});
	const total = $derived(totals.users + totals.events + totals.tickets + totals.orders + results.organizers.length + results.cases.length);
	const submit = (event?: SubmitEvent) => {
		event?.preventDefault();
		goto(`/search?q=${encodeURIComponent(query.trim())}`, { keepFocus: true, replaceState: true, noScroll: true });
	};

	const showing = (key: Exclude<typeof tab, 'all'>) => tab === 'all' || tab === key;
</script>

<svelte:head><title>Search HUD · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Search HUD"
		subtitle="One query surface across attendees, events, smart passes, transactions, organizers, and incident reports."
		crumbs={['overview', 'search']}
		eyebrow="Federated index"
	>
		{#snippet meta()}
			<span class="chip !h-[19px] !text-[8px]">Index rebuilt 42s ago</span>
		{/snippet}
	</PageHeader>

	<section class="panel overflow-hidden">
		<form onsubmit={submit} class="flex items-center gap-3 border-b border-[#26262e] px-3.5 py-3">
			<Search size={17} class="shrink-0 text-[#8f8f9b]" />
			<input
				bind:this={input}
				bind:value={query}
				class="min-w-0 flex-1 bg-transparent font-display text-[17px] text-[#f0f0f5] outline-none placeholder:text-[#5d5d69]"
				placeholder="Search attendees, events, orders, tickets…"
				aria-label="Search the platform"
				autocomplete="off"
			/>
			{#if total > 0}
				<span class="chip !h-[22px] !text-[9px]">{total} results</span>
			{/if}
			<button class="btn btn-sm btn-primary" type="submit">Search <CornerDownLeft size={11} /></button>
		</form>

		<div class="flex flex-col gap-2 px-3.5 py-2.5 lg:flex-row lg:items-center">
			<div class="flex flex-wrap items-center gap-1">
				{#each [{ key: 'all', label: 'All Results', count: total }, { key: 'users', label: 'Attendees & Users', count: totals.users }, { key: 'events', label: 'Events', count: totals.events }, { key: 'tickets', label: 'Tickets & Passes', count: totals.tickets }, { key: 'orders', label: 'Transactions', count: totals.orders }] as item}
					<button type="button" class="chip !h-[26px] !text-[9.5px] {tab === item.key ? '!border-[#c6bcff]/45 !bg-[#c6bcff]/15 !text-[#dcd6ff]' : ''}" onclick={() => (tab = item.key as typeof tab)}>
						{item.label} ({item.count})
					</button>
				{/each}
			</div>
			<p class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b] lg:ml-auto">
				Scoped: {num(results.scope.users)} users · {num(results.scope.events)} events · {num(results.scope.tickets)} tickets · ledger
				<span class="ml-2 text-emerald-300">{results.elapsedMs || 8.2}ms</span>
			</p>
		</div>
	</section>

	{#if total === 0}
		<div class="panel">
			<EmptyState
				title={data.q ? `No indexed records match “${data.q}”` : 'Start typing to search the control plane'}
				message={data.q ? 'Try a handle, order reference (ORD-…), pass code (OWL-…), CAC number, or attendee email.' : 'The HUD searches across 18,420 users, 142 events, 4,820 tickets, 4,904 orders, and the full audit ledger in a single pass.'}
			>
				{#snippet action()}
					<a class="btn btn-sm btn-primary" href="/search?q=Alex%20Rivera">Try a sample query</a>
				{/snippet}
			</EmptyState>
			{#if data.q}
				<div class="flex flex-wrap gap-1.5 border-t border-[#26262e] px-4 py-3">
					<span class="mono-label !text-[8px]">Try</span>
					{#each ['Alex Rivera', 'OWL-2025-AI', 'ORD-9942-NG', 'Pulse AI', 'alex_rivera'] as suggestion}
						<a class="chip !h-[20px] !text-[8.5px] hover:!text-[#dcd6ff]" href={`/search?q=${encodeURIComponent(suggestion)}`}>{suggestion}</a>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			{#if showing('users') && results.users.length}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<div class="flex items-center gap-2"><Users size={12} class="text-[#8f8f9b]" /><p class="mono-label">Attendees & registered users</p></div>
						<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Primary match</span>
					</header>
					<div class="divide-y divide-[#24242c]">
						{#each results.users as user (user.id)}
							<a href={`/users?user=${user.id}`} class="group flex flex-wrap items-center gap-3 px-3.5 py-3 transition hover:bg-[#1b1b22] md:flex-nowrap">
								<Avatar name={user.name} size="md" accent={user.status === 'active'} />
								<div class="min-w-0">
									<p class="flex flex-wrap items-center gap-1.5">
										<span class="text-[13px] font-semibold text-[#ececf1] group-hover:text-[#dcd6ff]">{user.name}</span>
										<span class="font-code text-[9px] text-[#8f8f9b]">@{user.handle}</span>
										<span class="font-code text-[8px] uppercase text-[#5d5d69]">#{user.id.toUpperCase()}</span>
										<span class="chip chip-accent !h-[17px] !text-[8px]">KYC Tier {user.kycTier}</span>
									</p>
									<p class="mt-0.5 font-code text-[9px] text-[#6f6f7b]">{user.email} · {user.phone}</p>
								</div>
								<div class="ml-auto flex items-center gap-5 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">
									<div><p>Lifetime</p><p class="mt-0.5 text-[11px] normal-case tracking-normal text-[#e6e6ec]">{money(user.spendNgn)}</p></div>
									<div><p>Passes</p><p class="mt-0.5 text-[11px] normal-case tracking-normal text-[#e6e6ec]">{user.ticketsCount}</p></div>
									<div><p>Orders</p><p class="mt-0.5 text-[11px] normal-case tracking-normal text-[#e6e6ec]">{user.ordersCount}</p></div>
									<div class="hidden lg:block"><p>Last seen</p><p class="mt-0.5 text-[11px] normal-case tracking-normal text-[#e6e6ec]">{relative(user.lastSeenAt)}</p></div>
								</div>
								<ArrowUpRight size={13} class="text-[#5d5d69] group-hover:text-[#c6bcff]" />
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if showing('tickets') && results.tickets.length}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<div class="flex items-center gap-2"><Ticket size={12} class="text-[#8f8f9b]" /><p class="mono-label">Tickets & smart passes</p></div>
						<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
							{results.tickets.filter((ticket) => ticket.status === 'valid').length} active admission
						</span>
					</header>
					<div class="divide-y divide-[#24242c]">
						{#each results.tickets as ticket (ticket.id)}
							<a href={`/tickets?ticket=${ticket.id}`} class="group flex flex-wrap items-center gap-3 px-3.5 py-3 transition hover:bg-[#1b1b22] md:flex-nowrap">
								<span class="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded border border-[#34343d] bg-[#1e1e25] font-code text-[7px] uppercase leading-tight text-[#a9a9b6]">
									pass
								</span>
								<div class="min-w-0">
									<p class="flex flex-wrap items-center gap-1.5">
										<span class="text-[12px] font-medium text-[#ececf1] group-hover:text-[#dcd6ff]">{ticket.eventTitle}</span>
										<span class="font-code text-[8.5px] text-[#8f8f9b]">{ticket.code}</span>
										<span class="chip !h-[17px] !text-[8px]">{ticket.tierName}</span>
									</p>
									<p class="mt-0.5 font-code text-[9px] text-[#6f6f7b]">
										SEAT: {ticket.seat} · {ticket.holderName} · {relative(ticket.purchasedAt)}
									</p>
								</div>
								<div class="ml-auto flex items-center gap-5 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">
									<div><p>Purchased</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">{relative(ticket.purchasedAt)}</p></div>
									<div class="hidden lg:block"><p>Seat</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">{ticket.seat}</p></div>
									<div class="hidden xl:block"><p>Order</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">{ticket.orderRef}</p></div>
								</div>
								<StatusChip label={ticketStatus(ticket.status).label} tone={ticketStatus(ticket.status).tone} />
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if showing('orders') && results.orders.length}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<div class="flex items-center gap-2"><Wallet size={12} class="text-[#8f8f9b]" /><p class="mono-label">Orders & transactions</p></div>
						<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Paystack ledger</span>
					</header>
					<div class="divide-y divide-[#24242c]">
						{#each results.orders as order (order.id)}
							<a href={`/orders?order=${order.id}`} class="group flex flex-wrap items-center gap-3 px-3.5 py-3 transition hover:bg-[#1b1b22] md:flex-nowrap">
								<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#34343d] bg-[#1e1e25] font-code text-[7px] uppercase text-[#a9a9b6]">paid</span>
								<div class="min-w-0">
									<p class="flex flex-wrap items-center gap-1.5">
										<span class="text-[12px] font-medium text-[#ececf1] group-hover:text-[#dcd6ff]">Order {order.reference}</span>
										<span class="chip !h-[17px] !text-[8px]">{order.method}</span>
										<span class="chip chip-ok !h-[17px] !text-[8px]">Webhook 200 OK</span>
									</p>
									<p class="mt-0.5 font-code text-[9px] text-[#6f6f7b]">{order.customerName} · {order.eventTitle} · {shortDate(order.createdAt)}</p>
								</div>
								<div class="ml-auto flex items-center gap-5 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">
									<div><p>Settled</p><p class="mt-0.5 text-[11px] normal-case tracking-normal text-[#e6e6ec]">{money(order.totalNgn)}</p></div>
									<div class="hidden lg:block"><p>Target</p><p class="mt-0.5 max-w-[160px] truncate text-[10px] normal-case tracking-normal text-[#dcdce4]">{order.eventTitle}</p></div>
									<div class="hidden xl:block"><p>Reference</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">PSTK_TXN_{order.id.slice(-8).toUpperCase()}</p></div>
								</div>
								<span class={chipClass(orderStatus(order.status).tone)}>{orderStatus(order.status).label}</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if showing('events') && results.events.length}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<div class="flex items-center gap-2"><CalendarDays size={12} class="text-[#8f8f9b]" /><p class="mono-label">Events & listings</p></div>
						<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">{results.events.length} matched</span>
					</header>
					<div class="divide-y divide-[#24242c]">
						{#each results.events as event (event.id)}
							<a href={`/events/${event.id}`} class="group flex flex-wrap items-center gap-3 px-3.5 py-3 transition hover:bg-[#1b1b22] md:flex-nowrap">
								<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#34343d] bg-[#1e1e25]"><CalendarDays size={13} class="text-[#a9a9b6]" /></span>
								<div class="min-w-0">
									<p class="flex flex-wrap items-center gap-1.5">
										<span class="text-[12px] font-medium text-[#ececf1] group-hover:text-[#dcd6ff]">{event.title}</span>
										<span class="chip !h-[17px] !text-[8px]">{event.category}</span>
									</p>
									<p class="mt-0.5 font-code text-[9px] text-[#6f6f7b]">{event.ref} · {event.organizerName} · {event.venue}</p>
								</div>
								<div class="ml-auto flex items-center gap-5 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">
									<div><p>Starts</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">{shortDate(event.startsAt)}</p></div>
									<div><p>Sold</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">{num(event.sold)} / {num(event.capacity)}</p></div>
									<div class="hidden lg:block"><p>Revenue</p><p class="mt-0.5 text-[10px] normal-case tracking-normal text-[#dcdce4]">{money(event.grossNgn)}</p></div>
								</div>
								<span class="chip !h-[18px] !text-[8px]">{event.status}</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if (results.organizers.length || results.cases.length) && tab === 'all'}
				<section class="grid grid-cols-1 gap-3 lg:grid-cols-2">
					<div class="panel overflow-hidden">
						<header class="panel-head">
							<div class="flex items-center gap-2"><ShieldAlert size={12} class="text-[#8f8f9b]" /><p class="mono-label">Organizer accounts</p></div>
							<span class="font-code text-[8px] uppercase text-[#6f6f7b]">{results.organizers.length} matched</span>
						</header>
						<div class="divide-y divide-[#24242c]">
							{#each results.organizers as org (org.id)}
								<a href={`/organizers?organizer=${org.id}`} class="flex items-center gap-2 px-3.5 py-2.5 hover:bg-[#1b1b22]">
									<div class="min-w-0 flex-1">
										<p class="truncate text-[11px] text-[#e6e6ec]">{org.name}</p>
										<p class="font-code text-[8.5px] text-[#6f6f7b]">{org.cacRegNumber} · Tier {org.tier}</p>
									</div>
									<span class="chip !h-[17px] !text-[8px]">{org.status}</span>
								</a>
							{:else}
								<p class="px-3.5 py-3 text-[10.5px] text-[#6f6f7b]">No organizer records matched.</p>
							{/each}
						</div>
					</div>
					<div class="panel overflow-hidden">
						<header class="panel-head">
							<div class="flex items-center gap-2"><Flag size={12} class="text-[#8f8f9b]" /><p class="mono-label">Moderation & security reports</p></div>
							<span class="font-code text-[8px] uppercase text-[#6f6f7b]">{results.cases.length} matched</span>
						</header>
						<div class="divide-y divide-[#24242c]">
							{#each results.cases as item (item.id)}
								<a href={`/moderation?case=${item.id}`} class="flex items-center gap-2 px-3.5 py-2.5 hover:bg-[#1b1b22]">
									<div class="min-w-0 flex-1">
										<p class="truncate text-[11px] text-[#e6e6ec]">{item.title}</p>
										<p class="font-code text-[8.5px] text-[#6f6f7b]">{item.ref} · {item.target}</p>
									</div>
									<span class={chipClass(item.severity === 'critical' || item.severity === 'high' ? 'danger' : 'warn')}>{item.severity}</span>
								</a>
							{:else}
								<p class="px-3.5 py-3 text-[10.5px] text-[#6f6f7b]">No incident records matched.</p>
							{/each}
						</div>
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>

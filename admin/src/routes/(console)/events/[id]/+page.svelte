<script lang="ts">
	import {
		ArrowLeft,
		BadgeCheck,
		Ban,
		CalendarDays,
		Check,
		Download,
		ExternalLink,
		MapPin,
		Ticket,
		Trash2,
		Users
	} from '@lucide/svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, eventStatus, orderStatus, ticketStatus } from '$admin/utils/status';
	import { countdown, dateTime, money, moneyCompact, num, pct, relative } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();
	const event = $derived(data.event);
	const meta = $derived(eventStatus(event.status));
	const soldPct = $derived(event.capacity ? (event.sold / event.capacity) * 100 : 0);
	const remainingPct = $derived(
		event.capacity ? ((event.capacity - event.sold) / event.capacity) * 100 : 0
	);

	let actionOpen = $state(false);
	let action = $state<'published' | 'suspended' | 'rejected' | 'draft'>('published');
	let reason = $state('');
	let deleteOpen = $state(false);
	let deleteReason = $state('');
	let busy = $state(false);

	async function apply() {
		busy = true;
		const response = await fetch(`/api/events/${event.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: action, reason })
		});
		const payload = (await response.json().catch(() => ({}))) as { message?: string };
		busy = false;
		if (!response.ok) {
			toasts.error('Decision not applied', payload.message ?? 'Insufficient privileges or invalid transition.');
			return;
		}
		toasts.ok(
			action === 'published' ? 'Event enabled & live' : action === 'suspended' ? 'Event disabled' : 'Event updated',
			`Status is now ${action}. Audit trail & organizer notification sent.`
		);
		actionOpen = false;
		reason = '';
		await invalidateAll();
	}

	async function deleteEvent() {
		busy = true;
		const response = await fetch(`/api/events/${event.id}`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ reason: deleteReason || 'Deleted from Event Dossier' })
		});
		const payload = (await response.json().catch(() => ({}))) as { message?: string };
		busy = false;
		if (!response.ok) {
			toasts.error('Delete failed', payload.message ?? 'Unable to delete event.');
			return;
		}
		toasts.ok('Event deleted', `"${event.title}" was permanently removed.`);
		deleteOpen = false;
		await goto('/events');
	}
</script>

<svelte:head><title>{event.title} · Events · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<a href="/events" class="btn btn-sm btn-ghost"><ArrowLeft size={12} /> Events</a>
		<span class="font-code text-[9px] uppercase tracking-[0.1em] text-[#54545f]">{event.ref}</span>
	</div>

	<PageHeader
		title={event.title}
		subtitle={`${event.category} · ${event.venue}, ${event.city} · ${dateTime(event.startsAt)}`}
		crumbs={['platform', 'events']}
		eyebrow={`Live record · ${meta.label}`}
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/events?event={event.id}" download>
				<Download size={12} /> Export CSV
			</a>
			<a class="btn btn-sm" href={`${data.publicAppUrl}/events/${event.slug}`} target="_blank" rel="noreferrer">
				<ExternalLink size={12} /> View public page
			</a>
			{#if event.status === 'published' || event.status === 'completed'}
				<button
					type="button"
					class="btn btn-sm btn-danger-soft"
					onclick={() => {
						action = 'suspended';
						actionOpen = true;
					}}
				>
					<Ban size={12} /> Disable event
				</button>
			{:else}
				<button
					type="button"
					class="btn btn-sm btn-primary"
					onclick={() => {
						action = 'published';
						actionOpen = true;
					}}
				>
					<Check size={12} /> Enable / publish event
				</button>
			{/if}
			<button
				type="button"
				class="btn btn-sm btn-danger"
				onclick={() => {
					deleteReason = '';
					deleteOpen = true;
				}}
			>
				<Trash2 size={12} /> Delete event
			</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Passes sold</p><Ticket size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(event.sold)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{num(Math.max(0, event.capacity - event.sold))} remaining · {pct(soldPct, 0)} capacity</p>
			<div class="meter mt-2.5"><div class="meter-fill" style={`width:${soldPct}%`}></div></div>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Gross ticketing</p>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(event.grossNgn)}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">Tier sold × price</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Tickets remaining</p>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(Math.max(0, event.capacity - event.sold))}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{pct(remainingPct, 1)} of capacity still unsold</p>
			<div class="meter mt-2.5"><div class="meter-fill meter-ok" style={`width:${soldPct}%`}></div></div>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Event status</p><StatusChip label={meta.label} tone={meta.tone} /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(event.tiers.length)} <span class="font-code text-[10px] font-normal text-[#6f6f7b]">tiers</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{event.status === 'completed' ? 'Event window closed' : event.startsAt <= new Date().toISOString() ? `Live now · ends ${countdown(event.endsAt)}` : `Starts ${countdown(event.startsAt)}`}</p>
		</div>
	</div>

	<div class="panel overflow-hidden">
		<div
			class="relative h-44 overflow-hidden sm:h-56"
			style={`background:linear-gradient(120deg, ${event.coverFrom} 0%, ${event.coverTo} 100%)`}
		>
			{#if event.coverSrc}
				<img src={event.coverSrc} alt={event.title} class="absolute inset-0 h-full w-full object-cover" />
			{:else}
				<div class="absolute inset-0 surface-grid opacity-30"></div>
			{/if}
			<div class="absolute inset-0 bg-gradient-to-t from-[#0f0f13] via-black/30 to-transparent"></div>
			<div class="absolute left-4 top-4 flex flex-wrap gap-1.5">
				<span class="chip !bg-black/60 !text-[#ececf1]">{event.category}</span>
				<span class="chip !bg-black/60 !text-[#ececf1]">{event.ref}</span>
				<span class="chip !bg-black/60 !text-[#ececf1]">slug: {event.slug}</span>
			</div>
			<div class="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2">
				<div>
					<p class="font-code text-[8.5px] uppercase tracking-[0.14em] text-white/75">{event.venue}</p>
					<p class="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-white/90">
						<CalendarDays size={12} /> {dateTime(event.startsAt)} → {dateTime(event.endsAt)}
						<span class="text-white/30">•</span>
						<MapPin size={12} /> {event.city}
					</p>
				</div>
				<div class="flex gap-1.5">
					<span class="chip !bg-black/60 !text-[#ececf1]">{num(event.tiers.length)} tiers</span>
					<span class="chip !bg-black/60 !text-[#ececf1]">{num(event.sold)} sold</span>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[1.55fr_1fr]">
			<div>
				<p class="mono-label">Event description & details</p>
				<p class="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-[#c3c3cf]">
					{event.description || `${event.title} hosted by ${event.organizerName} at ${event.venue}, ${event.city}.`}
				</p>

				<div class="mt-4">
					<p class="mono-label">Tier allocation & pricing</p>
					<div class="mt-2 overflow-hidden rounded-lg border border-[#292930]">
						<table class="tbl">
							<thead>
								<tr>
									<th>Tier</th>
									<th class="!text-right">Price</th>
									<th class="!text-right">Sold</th>
									<th class="!text-right">Capacity</th>
									<th class="!text-right">Gross</th>
								</tr>
							</thead>
							<tbody>
								{#each event.tiers as tier}
									<tr>
										<td>
											<p class="primary-cell text-[11px]">{tier.name}</p>
											{#if tier.benefits}
												<p class="mt-0.5 text-[10px] text-[#7f7f8c]">{tier.benefits}</p>
											{/if}
										</td>
										<td class="num">{money(tier.priceNgn)}</td>
										<td class="num">{num(tier.sold)}</td>
										<td class="num">{num(tier.capacity)}</td>
										<td class="num">{money(tier.sold * tier.priceNgn)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				{#if event.promos && event.promos.length > 0}
					<div class="mt-4">
						<p class="mono-label">Active promo codes (hidden on public feed)</p>
						<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each event.promos as promo}
								<div class="panel-inset flex items-center justify-between p-2.5 text-[11px]">
									<span class="font-code font-semibold text-[#c6bcff]">{promo.code}</span>
									<span class="font-code text-[10px] text-[#a0a0ab]">
										{promo.percent}% off · {promo.used}/{promo.maxUses || '∞'} used
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if (event.gatesList && event.gatesList.length > 0) || (event.speakersList && event.speakersList.length > 0)}
					<div class="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
						{#if event.gatesList && event.gatesList.length > 0}
							<div class="panel-inset p-3">
								<p class="mono-label !text-[8px]">Configured entry gates</p>
								<div class="mt-1.5 space-y-1 text-[10.5px]">
									{#each event.gatesList as gate}
										<p class="flex justify-between text-[#c9c9d4]">
											<span>{gate.name}</span>
											<span class="font-code text-[#8f8f9b]">{gate.staffCount} staff</span>
										</p>
									{/each}
								</div>
							</div>
						{/if}
						{#if event.speakersList && event.speakersList.length > 0}
							<div class="panel-inset p-3">
								<p class="mono-label !text-[8px]">Lineup & speaker invites</p>
								<div class="mt-1.5 space-y-1 text-[10.5px]">
									{#each event.speakersList as sp}
										<p class="flex justify-between gap-2 text-[#c9c9d4]">
											<span class="truncate">{sp.name}{sp.handle ? ` (@${sp.handle})` : ''}</span>
											<span class="font-code text-[9.5px] text-[#8f8f9b]">{sp.inviteStatus ?? sp.role}</span>
										</p>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="space-y-2.5">
				<div class="panel-inset p-3">
					<p class="mono-label !text-[8px]">Organizer (full contact)</p>
					<div class="mt-2 flex items-center gap-2">
						<span class="flex h-8 w-8 items-center justify-center rounded-md bg-[#2a2540] font-code text-[10px] text-[#c6bcff]">
							{event.organizerName.slice(0, 2).toUpperCase()}
						</span>
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-1 truncate text-[11.5px] text-[#e6e6ec]">
								{event.organizerName}
								<BadgeCheck size={11} class="text-[#8dd3c7]" />
							</p>
							{#if event.organizerHandle}
								<p class="font-code text-[8.5px] text-[#9b9ba8]">@{event.organizerHandle}</p>
							{/if}
							{#if event.organizerEmail}
								<p class="font-code text-[8.5px] select-all text-[#c6bcff]">{event.organizerEmail}</p>
							{/if}
							{#if event.organizerPhone}
								<p class="font-code text-[8.5px] select-all text-[#a0a0ab]">{event.organizerPhone}</p>
							{/if}
						</div>
						{#if event.organizerId}
							<a href={`/users/${event.organizerId}`} class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">
								User dossier
							</a>
						{/if}
					</div>
				</div>

				{#if event.moderationNote}
					<div class="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3">
						<p class="mono-label !text-[8px] !text-amber-200/80">Moderation note</p>
						<p class="mt-1 text-[10.5px] leading-relaxed text-amber-100/80">{event.moderationNote}</p>
					</div>
				{/if}

				<div class="panel-inset p-3">
					<div class="flex items-center justify-between">
						<p class="mono-label !text-[8px]">Audit trail</p>
						<a href="/audit" class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">All logs</a>
					</div>
					<div class="mt-2 space-y-2">
						{#if data.audit.length === 0}
							<p class="text-[10px] text-[#6f6f7b]">No session audit actions recorded for this event yet.</p>
						{/if}
						{#each data.audit as record}
							<div class="border-l border-[#33333d] pl-2.5">
								<p class="font-code text-[8.5px] uppercase tracking-[0.05em] text-[#c9c9d4]">{record.action}</p>
								<p class="mt-0.5 text-[9.5px] text-[#6f6f7b]">{record.actor} · {relative(record.at)}</p>
							</div>
						{/each}
					</div>
				</div>

				<a href={`/tickets?eventId=${event.id}`} class="btn btn-sm w-full">
					<Users size={12} /> View all issued passes
				</a>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
		<section class="panel overflow-hidden">
			<div class="panel-head">
				<div>
					<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Recent orders</h2>
					<p class="mt-0.5 text-[10.5px] text-[#7f7f8c]">Latest settlement activity for this event.</p>
				</div>
				<a href="/orders" class="font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff]">All orders →</a>
			</div>
			{#if data.orders.length === 0}
				<EmptyState title="No orders yet" message="Ticket purchases for this event will appear here." />
			{:else}
				<div class="table-wrap">
					<table class="tbl">
						<thead>
							<tr>
								<th>Order</th>
								<th>Customer</th>
								<th class="!text-right">Total</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.orders as order}
								{@const s = orderStatus(order.status)}
								<tr>
									<td class="font-code text-[10px] text-[#c6bcff]">{order.reference}</td>
									<td>
										<p class="text-[11px] text-[#ededf4]">{order.customerName}</p>
										{#if order.customerEmail}
											<p class="font-code text-[8.5px] text-[#8f8f9b]">{order.customerEmail}</p>
										{/if}
									</td>
									<td class="num">{money(order.totalNgn)}</td>
									<td><span class={chipClass(s.tone)}>{s.label}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
		<section class="panel overflow-hidden">
			<div class="panel-head">
				<div>
					<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Issued passes</h2>
					<p class="mt-0.5 text-[10.5px] text-[#7f7f8c]">Cryptographic admission credentials.</p>
				</div>
				<a href={`/tickets?eventId=${event.id}`} class="font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff]">Registry →</a>
			</div>
			{#if data.tickets.length === 0}
				<EmptyState title="No passes minted" message="Issued tickets for this event will appear here." />
			{:else}
				<div class="table-wrap">
					<table class="tbl">
						<thead>
							<tr>
								<th>Pass</th>
								<th>Holder</th>
								<th>Tier</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.tickets as ticket}
								{@const s = ticketStatus(ticket.status)}
								<tr>
									<td class="font-code text-[10px] text-[#c6bcff]">{ticket.code}</td>
									<td class="text-[11px]">{ticket.holderName}</td>
									<td class="text-[10.5px]">{ticket.tierName}</td>
									<td><span class={chipClass(s.tone)}>{s.label}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>
</div>

<Sheet
	open={actionOpen}
	title={action === 'suspended' ? 'Disable event listing' : action === 'published' ? 'Enable & publish event' : 'Update event status'}
	subtitle="Decisions take effect immediately on the public app and notify the organizer."
	onclose={() => (actionOpen = false)}
	width="440px"
>
	<form class="space-y-3" onsubmit={(e) => { e.preventDefault(); apply(); }}>
		<label class="field-label" for="decision">Decision note</label>
		<textarea
			id="decision"
			class="textarea"
			bind:value={reason}
			placeholder={action === 'suspended'
				? 'Reason for disabling this event (sent to the organizer)…'
				: 'Optional note for publishing / re-enabling this event…'}
		></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (actionOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm {action === 'suspended' ? 'btn-danger' : 'btn-primary'}" disabled={busy}>
				{action === 'suspended' ? 'Disable event' : 'Enable & publish'}
			</button>
		</div>
	</form>
</Sheet>

<Sheet
	open={deleteOpen}
	title={`Delete "${event.title}"`}
	subtitle="Permanently deletes this event and cleans its tickets, orders, promos, and reports."
	onclose={() => (deleteOpen = false)}
	width="440px"
>
	<form class="space-y-3" onsubmit={(e) => { e.preventDefault(); deleteEvent(); }}>
		<label class="field-label" for="delete-reason">Deletion reason</label>
		<textarea
			id="delete-reason"
			class="textarea"
			bind:value={deleteReason}
			placeholder="e.g. Policy breach / duplicate event removed by Admin."
		></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (deleteOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>
				<Trash2 size={12} /> Permanently delete event
			</button>
		</div>
	</form>
</Sheet>

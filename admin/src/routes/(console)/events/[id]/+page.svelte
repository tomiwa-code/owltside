<script lang="ts">
	import {
		ArrowLeft,
		BadgeCheck,
		CalendarDays,
		Check,
		Download,
		ExternalLink,
		Flag,
		MapPin,
		ScanLine,
		ShieldCheck,
		Ticket,
		Users
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, eventStatus, orderStatus, ticketStatus } from '$admin/utils/status';
	import { countdown, dateTime, money, moneyCompact, num, pct, relative } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Sheet from '$components/Sheet.svelte';
	import EmptyState from '$components/EmptyState.svelte';

	let { data } = $props();
	const event = $derived(data.event);
	const meta = $derived(eventStatus(event.status));
	const soldPct = $derived(event.capacity ? (event.sold / event.capacity) * 100 : 0);
	const scanPct = $derived(event.sold ? (event.checkedIn / event.sold) * 100 : 0);

	let actionOpen = $state(false);
	let action = $state<'published' | 'suspended' | 'draft'>('published');
	let reason = $state('');
	let busy = $state(false);

	async function apply() {
		busy = true;
		const response = await fetch(`/api/events/${event.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: action, reason })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Decision not applied', 'Insufficient privileges or invalid transition.');
			return;
		}
		toasts.ok('Event updated', `Status is now ${action}. Audit trail updated.`);
		actionOpen = false;
		reason = '';
		await invalidateAll();
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
		eyebrow={event.status === 'published' ? 'Live listing' : event.status}
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/events?event={event.id}" download><Download size={12} /> Export roster</a>
			<a class="btn btn-sm" href={`${data.publicAppUrl}/events/${event.slug}`} target="_blank" rel="noreferrer">
				<ExternalLink size={12} /> View public page
			</a>
			{#if event.status === 'pending' || event.status === 'draft'}
				<button type="button" class="btn btn-sm btn-primary" onclick={() => { action = 'published'; actionOpen = true; }}>
					<Check size={12} /> Publish event
				</button>
			{:else if event.status === 'published'}
				<button type="button" class="btn btn-sm btn-danger-soft" onclick={() => { action = 'suspended'; actionOpen = true; }}>
					<Flag size={12} /> Suspend
				</button>
			{:else}
				<button type="button" class="btn btn-sm btn-primary" onclick={() => { action = 'published'; actionOpen = true; }}>
					Reinstate
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Passes sold</p><Ticket size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(event.sold)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{num(event.capacity - event.sold)} remaining · {pct(soldPct, 0)} capacity</p>
			<div class="meter mt-2.5"><div class="meter-fill" style={`width:${soldPct}%`}></div></div>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Gross ticketing</p>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(event.grossNgn)}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">Paystack settled · platform fee 6.5%</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Checked in</p>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(event.checkedIn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{pct(scanPct, 1)} of sold passes cleared</p>
			<div class="meter mt-2.5"><div class="meter-fill meter-ok" style={`width:${scanPct}%`}></div></div>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Gate fleet</p><StatusChip label={meta.label} tone={meta.tone} /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{event.gates} <span class="font-code text-[10px] font-normal text-[#6f6f7b]">gates</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{event.startsAt < new Date().toISOString() ? 'Event window closed' : `Starts ${countdown(event.startsAt)}`}</p>
		</div>
	</div>

	<div class="panel overflow-hidden">
		<div class="relative h-40 overflow-hidden sm:h-48" style={`background:linear-gradient(120deg, ${event.coverFrom} 0%, ${event.coverTo} 100%)`}>
			<div class="absolute inset-0 surface-grid opacity-30"></div>
			<div class="absolute inset-0 bg-gradient-to-t from-[#0f0f13] via-transparent to-transparent"></div>
			<div class="absolute left-4 top-4 flex flex-wrap gap-1.5">
				<span class="chip !bg-black/40 !text-[#ececf1]">{event.category}</span>
				<span class="chip !bg-black/40 !text-[#ececf1]">{event.ref}</span>
				{#if event.policyFlags}<span class="chip chip-danger">{event.policyFlags[0]}</span>{/if}
			</div>
			<div class="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2">
				<div>
					<p class="font-code text-[8.5px] uppercase tracking-[0.14em] text-white/60">{event.venue}</p>
					<p class="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-white/85">
						<CalendarDays size={12} /> {dateTime(event.startsAt)}
						<span class="text-white/30">•</span>
						<MapPin size={12} /> {event.city}
					</p>
				</div>
				<div class="flex gap-1.5">
					<span class="chip !bg-black/40 !text-[#ececf1]">{num(event.tiers.length)} tiers</span>
					<span class="chip !bg-black/40 !text-[#ececf1]">{event.gates} gates</span>
				</div>
			</div>
		</div>
		<div class="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[1.55fr_1fr]">
			<div>
				<p class="mono-label">Event summary</p>
				<p class="mt-2 text-[12px] leading-relaxed text-[#a0a0ab]">
					A curated {event.category.toLowerCase()} experience hosted by {event.organizerName} at {event.venue},
					{event.city}. Tickets are issued as rotating HMAC-SHA256 digital passes with offline turnstile cache
					synchronized across {event.gates} gates.
				</p>

				<div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
					<div class="panel-inset p-3">
						<p class="mono-label !text-[8px]">Settlement architecture</p>
						<div class="mt-1.5 space-y-1 text-[10.5px] text-[#a0a0ab]">
							<p class="flex justify-between"><span>Gateway</span><span class="font-code text-[#dcdce4]">Paystack dedicated</span></p>
							<p class="flex justify-between"><span>Subaccount</span><span class="font-code text-[#dcdce4]">ACCT-{event.id.slice(-6)}</span></p>
							<p class="flex justify-between"><span>Fee structure</span><span class="font-code text-[#dcdce4]">6.5% + ₦1,500</span></p>
						</div>
					</div>
					<div class="panel-inset p-3">
						<p class="mono-label !text-[8px]">Gate & credential security</p>
						<div class="mt-1.5 space-y-1 text-[10.5px] text-[#a0a0ab]">
							<p class="flex justify-between"><span>HMAC epoch</span><span class="font-code text-[#dcdce4]">14 · 30s rotation</span></p>
							<p class="flex justify-between"><span>Offline cache</span><span class="font-code text-[#dcdce4]">1,248 RSA keys</span></p>
							<p class="flex justify-between"><span>Scanner mode</span><span class="font-code text-[#dcdce4]">Fail-closed offline</span></p>
						</div>
					</div>
				</div>

				<div class="mt-4">
					<p class="mono-label">Tier allocation & pricing</p>
					<div class="mt-2 overflow-hidden rounded-lg border border-[#292930]">
						<table class="tbl">
							<thead><tr><th>Tier</th><th class="!text-right">Price</th><th class="!text-right">Sold</th><th class="!text-right">Capacity</th><th class="!text-right">Gross</th></tr></thead>
							<tbody>
								{#each event.tiers as tier}
									<tr>
										<td class="primary-cell text-[11px]">{tier.name}</td>
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
			</div>

			<div class="space-y-2.5">
				<div class="panel-inset p-3">
					<p class="mono-label !text-[8px]">Organizer & compliance</p>
					<div class="mt-2 flex items-center gap-2">
						<span class="flex h-8 w-8 items-center justify-center rounded-md bg-[#2a2540] font-code text-[10px] text-[#c6bcff]">
							{event.organizerName.slice(0, 2).toUpperCase()}
						</span>
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-1 truncate text-[11.5px] text-[#e6e6ec]">{event.organizerName}<BadgeCheck size={11} class="text-[#8dd3c7]" /></p>
							<p class="font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Tier {event.organizerTier} · KYB verified</p>
						</div>
						<a href={`/organizers/${event.organizerId}`} class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">Dossier</a>
					</div>
					<ul class="mt-2.5 space-y-1.5 border-t border-[#2a2a32] pt-2.5">
						<li class="flex items-center gap-1.5 text-[10px] text-[#a0a0ab]"><ShieldCheck size={11} class="text-emerald-400" /> CAC registry verified</li>
						<li class="flex items-center gap-1.5 text-[10px] text-[#a0a0ab]"><ScanLine size={11} class="text-emerald-400" /> Turnstile mesh synchronized</li>
						<li class="flex items-center gap-1.5 text-[10px] text-[#a0a0ab]"><Users size={11} class="text-emerald-400" /> Venue capacity physically verified</li>
					</ul>
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
							<p class="text-[10px] text-[#6f6f7b]">No admin actions recorded for this event yet.</p>
						{/if}
						{#each data.audit as record}
							<div class="border-l border-[#33333d] pl-2.5">
								<p class="font-code text-[8.5px] uppercase tracking-[0.05em] text-[#c9c9d4]">{record.action}</p>
								<p class="mt-0.5 text-[9.5px] text-[#6f6f7b]">{record.actor} · {relative(record.at)}</p>
							</div>
						{/each}
					</div>
				</div>

				<a href={`/tickets?eventId=${event.id}`} class="btn btn-sm w-full">View all issued passes</a>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
		<section class="panel overflow-hidden">
			<div class="panel-head"><div><h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Recent orders</h2><p class="mt-0.5 text-[10.5px] text-[#7f7f8c]">Latest settlement activity for this event.</p></div><a href="/orders" class="font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff]">All orders →</a></div>
			{#if data.orders.length === 0}
				<EmptyState title="No orders yet" message="Sales for this event have not started." />
			{:else}
				<div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th class="!text-right">Total</th><th>Status</th></tr></thead>
					<tbody>
						{#each data.orders as order}
							{@const s = orderStatus(order.status)}
							<tr><td class="font-code text-[10px] text-[#c6bcff]">{order.reference}</td><td class="text-[11px]">{order.customerName}</td><td class="num">{money(order.totalNgn)}</td><td><span class={chipClass(s.tone)}>{s.label}</span></td></tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>
		<section class="panel overflow-hidden">
			<div class="panel-head"><div><h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Issued passes</h2><p class="mt-0.5 text-[10.5px] text-[#7f7f8c]">Cryptographic admission credentials.</p></div><a href="/tickets" class="font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff]">Registry →</a></div>
			{#if data.tickets.length === 0}
				<EmptyState title="No passes minted" />
			{:else}
				<div class="table-wrap"><table class="tbl"><thead><tr><th>Pass</th><th>Holder</th><th>Tier</th><th>Status</th></tr></thead>
					<tbody>
						{#each data.tickets as ticket}
							{@const s = ticketStatus(ticket.status)}
							<tr><td class="font-code text-[10px] text-[#c6bcff]">{ticket.code}</td><td class="text-[11px]">{ticket.holderName}</td><td class="text-[10.5px]">{ticket.tierName}</td><td><span class={chipClass(s.tone)}>{s.label}</span></td></tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>
	</div>
</div>

<Sheet
	open={actionOpen}
	title={action === 'suspended' ? 'Suspend event listing' : action === 'published' ? 'Publish event' : 'Return event to drafts'}
	subtitle="Decisions are immutable and attributed to your admin identity."
	onclose={() => (actionOpen = false)}
	width="440px"
>
	<form class="space-y-3" onsubmit={(e) => { e.preventDefault(); apply(); }}>
		<label class="field-label" for="decision">Decision note</label>
		<textarea id="decision" class="textarea" bind:value={reason} required placeholder="Reason for this moderation decision…"></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (actionOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm {action === 'suspended' ? 'btn-danger' : 'btn-primary'}" disabled={busy}>
				{action === 'suspended' ? 'Suspend listing' : 'Confirm & publish'}
			</button>
		</div>
	</form>
</Sheet>

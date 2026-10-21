<script lang="ts">
	import { ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, Download, Landmark, MapPin, Receipt, ShieldAlert, ShieldCheck, TriangleAlert } from '@lucide/svelte';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, eventStatus, organizerStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative, shortDate } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import CoverArt from '$components/CoverArt.svelte';

	let { data } = $props();

	const org = $derived(data.organizer);
	const status = $derived(organizerStatus(org.status));
	const settlementTone = $derived(
		org.settlementState === 'linked' ? 'ok' : org.settlementState === 'pending' ? 'warn' : org.settlementState === 'conflict' ? 'warn' : 'danger'
	);
	const published = $derived(data.events.filter((event) => event.status === 'published'));
	const docPct = $derived(Math.round((org.verifiedDocs / Math.max(1, org.requiredDocs)) * 100));
	const eventWord = $derived(org.eventsCount === 1 ? 'event' : 'events');

	function exportDossier() {
		const blob = new Blob([JSON.stringify({ organizer: org, events: data.events }, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${org.slug}-kyb-dossier.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		toasts.ok('KYB dossier exported', `${org.slug}-kyb-dossier.json saved.`);
	}
</script>

<svelte:head><title>{org.name} · Organizers · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title={org.name}
		subtitle={`${org.legalName} — CAC ${org.cacRegNumber}${org.tin ? ` · TIN ${org.tin}` : ''}`}
		crumbs={['platform', 'organizers', org.slug]}
		eyebrow={`Tier ${org.tier} ${status.label}`}
	>
		{#snippet actions()}
			<a href="/organizers" class="btn btn-sm"><ArrowLeft size={12} /> Back to registry</a>
			<button type="button" class="btn btn-sm" onclick={exportDossier}><Download size={12} /> Export KYB dossier</button>
			<a class="btn btn-sm btn-primary" href={`/organizers?organizer=${org.id}`}><ShieldCheck size={12} /> Review compliance <ArrowUpRight size={11} /></a>
		{/snippet}
	</PageHeader>

	{#if org.flagReason || org.beneficiaryMismatch}
		<div class="panel flex items-start gap-3 border-red-500/25 bg-red-500/[0.05] p-3.5">
			<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300"><TriangleAlert size={15} /></span>
			<div class="min-w-0">
				<p class="font-display text-[12px] font-semibold text-red-50">Compliance flag raised</p>
				<p class="mt-0.5 text-[10.5px] leading-relaxed text-red-100/70">
					{org.flagReason ?? 'Beneficiary settlement account does not match the CAC registry legal name.'}
					{' '}Payout routing is blocked until operations clears the verification.
				</p>
			</div>
			<a class="btn btn-sm ml-auto shrink-0" href={`/organizers?organizer=${org.id}`}>Open KYC queue</a>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<p class="mono-label">Gross volume</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(org.grossVolumeNgn)}</p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">{num(org.ticketsSold)} tickets across {org.eventsCount} {eventWord}</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Escrow held</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(org.escrowHeldNgn)}</p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">Released on T+1 settlement cycle</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Settlement routing</p>
			<p class="mt-1.5 text-[12px] font-medium text-[#e6e6ec]">{org.settlementBank}</p>
			<p class="mt-1.5 flex items-center gap-1.5 font-code text-[9px] text-[#8f8f9b]"><Landmark size={9} /> ···· {org.settlementAccountLast4} <span class={chipClass(settlementTone)}>{org.settlementState}</span></p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Compliance documents</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{org.verifiedDocs}/{org.requiredDocs}</p>
			<div class="mt-2 h-1 overflow-hidden rounded-full bg-[#26262e]"><span class="block h-full rounded-full bg-[#8dd3c7]" style={`width:${docPct}%`}></span></div>
			<p class="mt-1.5 font-code text-[8px] uppercase text-[#6f6f7b]">{org.verifiedDocs} of {org.requiredDocs} verified · risk {org.risk}</p>
		</div>
	</div>

	<div class="grid grid-cols-1 items-start gap-3 xl:grid-cols-[1.55fr_1fr]">
		<div class="min-w-0 space-y-3">
		<section class="panel overflow-hidden">
			<header class="panel-head">
				<div class="flex items-center gap-2"><CalendarDays size={12} class="text-[#8f8f9b]" /><p class="mono-label">Event pipeline</p></div>
				<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">{published.length} published / {data.events.length} total</span>
			</header>
			<div class="divide-y divide-[#24242c]">
				{#each data.events as event (event.id)}
					<a href={`/events/${event.id}`} class="flex items-center gap-3 px-3.5 py-2.5 transition hover:bg-[#1b1b22]">
						<CoverArt from={event.coverFrom} to={event.coverTo} icon={event.coverIcon} compact class="!h-9 !w-9" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-[11.5px] font-medium text-[#e8e8ee]">{event.title}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">{event.ref} · {event.venue} · {shortDate(event.startsAt)}</p>
						</div>
						<div class="hidden text-right sm:block">
							<p class="font-code text-[10px] text-[#dcdce4]">{money(event.grossNgn)}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">{num(event.sold)} / {num(event.capacity)} sold</p>
						</div>
						<span class={chipClass(eventStatus(event.status).tone)}>{eventStatus(event.status).label}</span>
					</a>
				{:else}
					<p class="px-3.5 py-5 text-center text-[11px] text-[#6f6f7b]">No events submitted yet.</p>
				{/each}
			</div>
		</section>

				<section class="panel overflow-hidden">
					<header class="panel-head"><p class="mono-label">Recent settlements</p><Receipt size={12} class="text-[#8f8f9b]" /></header>
					<div class="divide-y divide-[#24242c]">
						{#each data.orders as order}
							<a href={`/orders?order=${order.id}`} class="flex items-center gap-2 px-3.5 py-2 hover:bg-[#1b1b22]">
								<div class="min-w-0 flex-1">
									<p class="truncate font-code text-[9.5px] text-[#dcdce4]">{order.reference}</p>
									<p class="truncate text-[8px] text-[#6f6f7b]">{order.customerName} · {relative(order.createdAt)}</p>
								</div>
								<span class="font-code text-[10px] text-[#e6e6ec]">{money(order.totalNgn)}</span>
							</a>
						{:else}
							<p class="px-3.5 py-3 text-[10.5px] text-[#6f6f7b]">No transactions indexed.</p>
						{/each}
					</div>
				</section>

		</div>

		<div class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Corporate profile</p><BadgeCheck size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-1.5 p-3.5 text-[10px]">
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Legal entity</span><span class="truncate text-right text-[#dcdce4]">{org.legalName}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">CAC registration</span><span class="font-code text-[#dcdce4]">{org.cacRegNumber}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Tax identification</span><span class="font-code text-[#dcdce4]">{org.tin ?? 'Not provided'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Primary contact</span><span class="text-[#dcdce4]">{org.contactName}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Email</span><span class="truncate font-code text-[#dcdce4]">{org.contactEmail}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Phone</span><span class="font-code text-[#dcdce4]">{org.contactPhone}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Registered office</span><span class="flex items-center gap-1 text-right text-[#dcdce4]"><MapPin size={9} class="text-[#6f6f7b]" /> {org.city}, {org.state}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Onboarded</span><span class="text-[#dcdce4]">{relative(org.createdAt)}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Last payout</span><span class="text-[#dcdce4]">{org.lastPayoutAt ? relative(org.lastPayoutAt) : 'Never disbursed'}</span></p>
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Compliance trail</p><ShieldAlert size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-2 p-3.5">
					{#each data.audit as record}
						<div class="border-l border-[#33333d] pl-2.5">
							<p class="font-code text-[8.5px] uppercase text-[#c9c9d4]">{record.action}</p>
							<p class="text-[9px] text-[#6f6f7b]">{record.actor} · {relative(record.at)}</p>
						</div>
					{:else}
						<p class="text-[10.5px] text-[#6f6f7b]">No compliance actions recorded.</p>
					{/each}
				</div>
			</section>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Tier-1 verified</p>
			<p class="mt-1 text-[11px] text-[#dcdce4]">{org.status === 'verified' ? 'CAC cross-check passed' : 'Pending compliance review'}</p>
		</div>
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Subaccount</p>
			<p class="mt-1 font-code text-[10px] text-[#dcdce4]">ACCT_{org.id.replace('org-', '')}_primary</p>
		</div>
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Avg ticket yield</p>
			<p class="mt-1 font-code text-[10px] text-[#dcdce4]">{org.ticketsSold ? money(Math.round(org.grossVolumeNgn / org.ticketsSold)) : '—'} <span class="text-[#6f6f7b]">· {org.ticketsSold} sold</span></p>
		</div>
	</div>

</div>

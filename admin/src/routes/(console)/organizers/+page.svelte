<script lang="ts">
	import {
		AlertTriangle,
		BadgeCheck,
		Building2,
		Check,
		ChevronRight,
		CircleCheck,
		CircleDashed,
		Download,
		FileCheck2,
		Landmark,
		ShieldCheck,
		ShieldX
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, organizerStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative } from '$admin/utils/format';
	import type { AdminOrganizer } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import SearchField from '$components/SearchField.svelte';
	import EmptyState from '$components/EmptyState.svelte';

	let { data } = $props();

	let override = $state<string | null>(null);
	let note = $state('');
	let busy = $state(false);

	const selected = $derived<AdminOrganizer | null>(
		data.table.rows.find((org) => org.id === (override ?? data.selectedId)) ?? data.selected
	);
	const pipeline = $derived(selected ? (data.pipelines[selected.id] ?? []) : []);
	const docs = $derived(
		selected
			? [
					{ label: 'CAC Form CAC-1.1 (Certificate)', meta: selected.cacRegNumber, ok: selected.verifiedDocs >= 1 },
					{ label: 'Federal Tax ID (FIRS TIN)', meta: selected.tin ?? 'Not provided', ok: selected.verifiedDocs >= 2 },
					{ label: `Director NIN (${selected.contactName})`, meta: 'NIN-••••••9102', ok: selected.verifiedDocs >= 3 },
					{ label: 'Memorandum of Association', meta: selected.verifiedDocs >= 4 ? 'Verified' : 'Seal unreadable · preview', ok: selected.verifiedDocs >= 4 }
				]
			: []
	);

	function change(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	async function apply(status: AdminOrganizer['status'], reason: string) {
		if (!selected) return;
		busy = true;
		const response = await fetch(`/api/organizers/${selected.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status, reason: reason || undefined })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('KYB decision failed', 'Your role may not permit this change.');
			return;
		}
		toasts.ok(
			status === 'verified' ? 'KYB approved' : status === 'suspended' ? 'Payouts frozen' : 'Organizer updated',
			`${selected.name} · ledger entry recorded with your admin signature.`
		);
		note = '';
		await invalidateAll();
	}
</script>

<svelte:head><title>Organizers · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Organizer Management"
		subtitle="Review KYB verifications, monitor ticket payouts via Paystack subaccounts, and manage organizer tiers."
		crumbs={['platform', 'organizers']}
		eyebrow="Compliance & KYB engine v2.45.0"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/organizers" download><Download size={12} /> Export KYB Compliance CSV</a>
			<a
				class="btn btn-sm btn-primary"
				href="/organizers?status=pending"
			>
				<BadgeCheck size={13} /> Verify Manual KYB
			</a>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total organizers</p><Building2 size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">All registered orgs <span class="text-emerald-300">+18 this month</span></p>
		</div>
		<div class="panel border-amber-400/25 bg-amber-400/[0.03] p-4">
			<div class="flex items-center justify-between"><p class="mono-label !text-amber-200/80">Pending KYB</p><span class="status-dot !bg-amber-400"></span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-amber-100">{String(data.counts.pending).padStart(2, '0')}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Needs review SLA &lt; 4h · {data.counts.flagged} critical</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Tier-1 verified (CAC)</p><ShieldCheck size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.tier1)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">CAC validated · {Math.round((data.counts.tier1 / Math.max(1, data.counts.total)) * 100)}% of base</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active payout volume</p><Landmark size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(data.counts.payoutVolumeNgn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">30D escrow & settled <span class="text-emerald-300">+12.4% MoM</span></p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search by org name, CAC reg no, contact…" class="xl:w-[300px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All ({data.counts.total})</option>
					<option value="verified" selected={data.filters.status === 'verified'}>Verified</option>
					<option value="pending" selected={data.filters.status === 'pending'}>Pending KYB</option>
					<option value="flagged" selected={data.filters.status === 'flagged'}>Flagged</option>
					<option value="suspended" selected={data.filters.status === 'suspended'}>Suspended</option>
				</select>
				<select name="tier" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by tier">
					<option value="all" selected={data.filters.tier === 'all'}>Tier: All entities</option>
					<option value="1" selected={data.filters.tier === '1'}>Tier 1</option>
					<option value="2" selected={data.filters.tier === '2'}>Tier 2</option>
					<option value="3" selected={data.filters.tier === '3'}>Tier 3</option>
				</select>
				<span class="chip !h-[34px] justify-center !text-[9px]">Sort: Volume desc</span>
			</div>
			<a href="/organizers" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<div class="grid grid-cols-1 gap-2.5 min-[1400px]:grid-cols-[1.62fr_1fr]">
		<section class="panel min-w-0 overflow-hidden">
			<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
				<p class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">Verified registry <span class="text-[#54545f]">· {data.table.rows.length} of {data.table.total}</span></p>
				<span class="chip chip-ok !h-[18px] !text-[8px]"><span class="status-dot !h-1 !w-1"></span> Real-time sync active</span>
			</div>
			{#if data.table.rows.length === 0}
				<EmptyState title="No organizers found" message="Try a different status or search term." />
			{:else}
				<div class="table-wrap">
					<table class="tbl tbl-tight">
						<thead>
							<tr><th>Entity & registry</th><th class="hidden lg:table-cell">Contact</th><th>Tier & status</th><th class="!text-right">Volume</th><th></th></tr>
						</thead>
						<tbody>
							{#each data.table.rows as org (org.id)}
								{@const meta = organizerStatus(org.status)}
								<tr data-selected={selected?.id === org.id}>
									<td class="min-w-[124px]">
										<div class="flex items-center gap-2.5">
											<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#383842] bg-[#23232b] font-code text-[9px] text-[#c9c9d4]">
												{org.name.slice(0, 2).toUpperCase()}
											</span>
											<div class="min-w-0">
												<button type="button" class="flex max-w-[136px] items-center gap-1 truncate text-left text-[11.5px] font-medium text-[#e8e8ee] hover:text-[#c6bcff]" onclick={() => (override = org.id)}>
													<span class="truncate">{org.name}</span>
													{#if org.risk === 'high'}<span class="chip chip-danger !h-[15px] !px-1 !text-[7px]">Flag</span>{/if}
												</button>
												<p class="mt-0.5 max-w-[112px] truncate font-code text-[8.5px] uppercase tracking-[0.06em] text-[#6f6f7b] sm:max-w-none">{org.cacRegNumber} · {org.city}, {org.state}</p>
											</div>
										</div>
									</td>
									<td class="hidden lg:table-cell">
										<p class="primary-cell text-[11px]">{org.contactName}</p>
										<p class="mt-0.5 max-w-[96px] truncate font-code text-[8.5px] text-[#6f6f7b]">{org.contactEmail}</p>
									</td>
									<td>
										<div class="flex flex-col items-start gap-1">
											<span class="chip !h-[16px] !text-[7.5px]">Tier {org.tier} · {org.tier === 1 ? 'Verified' : org.status === 'pending' ? 'Pending' : 'Verified'}</span>
											<StatusChip label={meta.label} tone={meta.tone} />
										</div>
									</td>
									<td class="num">
										<span class="whitespace-nowrap">{moneyCompact(org.grossVolumeNgn)}</span>
										<p class="truncate text-[8.5px] font-normal text-[#6f6f7b]">{org.eventsCount} events · {org.ticketsSold.toLocaleString('en-US')} sold</p>
										<p class="mt-0.5 flex items-center justify-end gap-1 truncate font-code text-[8px] font-normal text-[#6f6f7b]">
											<span class="h-1 w-1 shrink-0 rounded-full {org.settlementState === 'linked' ? 'bg-emerald-400' : org.settlementState === 'pending' ? 'bg-amber-400' : 'bg-red-400'}"></span>
											<span class="truncate">{org.settlementBank} ····{org.settlementAccountLast4}</span>
										</p>
									</td>
									<td>
										<div class="flex justify-end gap-1">
											<button type="button" class="row-action" aria-label={`Inspect ${org.name}`} onclick={() => (override = org.id)}>
												<FileCheck2 size={13} />
											</button>
											<a href={`/organizers/${org.id}`} class="row-action" aria-label={`Open ${org.name}`}><ChevronRight size={13} /></a>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<Pagination pageNumber={data.table.page} pages={data.table.pages} total={data.table.total} perPage={data.table.perPage} label="records" />
		</section>

		<aside class="min-w-0">
			{#if selected}
				{@const meta = organizerStatus(selected.status)}
				<div class="panel sticky top-[76px] overflow-hidden">
					<div class="flex items-start justify-between gap-2 border-b border-[#26262e] px-4 py-3">
						<div>
							<p class="mono-label">KYB dossier</p>
							<p class="mt-1 font-code text-[8.5px] text-[#6f6f7b]">{selected.cacRegNumber} · Firs {selected.tin ?? 'pending'}</p>
						</div>
						<span class="chip {selected.status === 'flagged' ? 'chip-danger' : selected.status === 'pending' ? 'chip-warn' : 'chip-ok'} !text-[8px]">
							{meta.label}
						</span>
					</div>

					<div class="p-4">
						<div class="flex items-start gap-2">
							<div class="min-w-0 flex-1">
								<h3 class="font-display text-[16px] font-semibold leading-snug text-[#f0f0f5]">{selected.name}</h3>
								<p class="mt-0.5 text-[10.5px] text-[#8f8f9b]">{selected.legalName}</p>
							</div>
							<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Submitted {relative(selected.createdAt)}</span>
						</div>

						{#if selected.status === 'flagged' || selected.beneficiaryMismatch || selected.settlementState === 'conflict'}
							<div class="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3">
								<div class="flex items-center gap-1.5">
									<AlertTriangle size={13} class="text-red-300" />
									<p class="font-code text-[8.5px] uppercase tracking-[0.1em] text-red-200">Risk flag detected</p>
								</div>
								<p class="mt-1.5 text-[10.5px] leading-relaxed text-red-100/80">
									Beneficiary name discrepancy. Settlement bank account name (“APEX VENTURES NIGERIA”) does not
									match the official CAC registry title. Automated payout routing blocked pending verification.
								</p>
								<div class="mt-2 grid grid-cols-2 gap-2 border-t border-red-500/20 pt-2 text-[9px]">
									<div><p class="text-[#a0a0ab]">NUBAN resolved</p><p class="font-code text-red-100">APEX VENTURES NIGERIA</p></div>
									<div><p class="text-[#a0a0ab]">CAC registered</p><p class="font-code text-red-100">{selected.name}</p></div>
								</div>
							</div>
						{/if}

						<div class="mt-4">
							<div class="flex items-center justify-between">
								<p class="mono-label !text-[8px]">Corporate documentation</p>
								<span class="font-code text-[8px] text-[#8f8f9b]">{selected.verifiedDocs} / {selected.requiredDocs} validated</span>
							</div>
							<ul class="mt-2 space-y-1.5">
								{#each docs as doc, index}
									<li class="flex items-center gap-2">
										{#if doc.ok}
											<CircleCheck size={12} class="shrink-0 text-emerald-400" />
										{:else}
											<CircleDashed size={12} class="shrink-0 text-[#6f6f7b]" />
										{/if}
										<span class="min-w-0 flex-1">
											<span class="block truncate text-[10.5px] text-[#c1c1cc]">{doc.label}</span>
											<span class="block truncate font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">{doc.meta}</span>
										</span>
										<button type="button" class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">View</button>
									</li>
								{/each}
							</ul>
						</div>

						<div class="mt-4 rounded-lg border border-[#2a2a32] bg-[#18181e] p-3">
							<div class="flex items-center justify-between">
								<p class="mono-label !text-[8px]">Settlement architecture</p>
								<span class="chip {selected.settlementState === 'conflict' ? 'chip-danger' : selected.settlementState === 'linked' ? 'chip-ok' : 'chip-warn'} !h-[16px] !text-[7.5px]">
									{selected.settlementState}
								</span>
							</div>
							<div class="mt-2 space-y-1 text-[10px] text-[#a0a0ab]">
								<p class="flex justify-between gap-2"><span>Gateway</span><span class="font-code text-[#dcdce4]">Paystack dedicated</span></p>
								<p class="flex justify-between gap-2"><span>Bank</span><span class="font-code text-[#dcdce4]">{selected.settlementBank}</span></p>
								<p class="flex justify-between gap-2"><span>Account</span><span class="font-code text-[#dcdce4]">•••• {selected.settlementAccountLast4}</span></p>
								<p class="flex justify-between gap-2"><span>Escrow held</span><span class="font-code text-[#dcdce4]">{money(selected.escrowHeldNgn)}</span></p>
							</div>
						</div>

						<div class="mt-4">
							<p class="mono-label !text-[8px]">Event target pipeline</p>
							{#if pipeline.length > 0}
								<div class="mt-1.5 space-y-1.5">
									{#each pipeline as event}
										<a href={`/events/${event.id}`} class="flex items-center gap-2 rounded-md border border-[#292930] px-2 py-1.5 hover:bg-[#1e1e25]">
											<Building2 size={12} class="shrink-0 text-[#6f6f7b]" />
											<span class="min-w-0 flex-1 truncate text-[10.5px] text-[#c9c9d4]">{event.title}</span>
											<span class="font-code text-[8.5px] text-[#6f6f7b]">{num(event.sold)} sold</span>
										</a>
									{/each}
								</div>
							{:else}
								<p class="mt-1.5 text-[10px] text-[#6f6f7b]">
									{num(selected.eventsCount)} events · {num(selected.ticketsSold)} tickets lifetime
								</p>
							{/if}
						</div>

						<div class="mt-4">
							<label class="field-label" for="kyb-note">Compliance decision feedback</label>
							<textarea
								id="kyb-note"
								class="textarea !min-h-[64px] !text-[11px]"
								bind:value={note}
								placeholder="Enter compliance feedback, CAC cross-check reason, or rejection clause…"
							></textarea>
						</div>

						<div class="mt-3 space-y-1.5">
							{#if selected.status !== 'verified'}
								<button type="button" class="btn btn-primary w-full !text-[12px]" disabled={busy} onclick={() => apply('verified', note || 'Manual KYB verification completed — documents cross-checked against CAC registry.')}>
									<BadgeCheck size={13} /> Approve KYB Tier-{selected.tier} & Bind Subaccount
								</button>
								<div class="grid grid-cols-2 gap-1.5">
									<button type="button" class="btn btn-sm" onclick={() => toasts.info('CAC document requested', 'Organizer notified to re-upload the certificate.')}>
										Request CAC doc
									</button>
									<button type="button" class="btn btn-sm btn-danger" disabled={busy} onclick={() => apply('flagged', note || 'Beneficiary mismatch — payout routing blocked pending board resolution.')}>
										<ShieldX size={12} /> Reject & Restrict
									</button>
								</div>
							{:else}
								<div class="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2">
									<p class="flex items-center gap-1.5 text-[10.5px] text-emerald-200"><Check size={12} /> KYB verified · payouts enabled</p>
									<p class="mt-0.5 font-code text-[8px] uppercase tracking-[0.06em] text-emerald-200/60">
										Last payout {selected.lastPayoutAt ? relative(selected.lastPayoutAt) : 'pending'} · {money(selected.escrowHeldNgn)} held
									</p>
								</div>
								<button type="button" class="btn btn-sm btn-danger-soft w-full" disabled={busy} onclick={() => apply('suspended', note || 'Payouts frozen pending compliance review.')}>
									Freeze payouts & suspend organizer
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>

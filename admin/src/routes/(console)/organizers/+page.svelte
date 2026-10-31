<script lang="ts">
	import {
		BadgeCheck,
		Ban,
		Building2,
		Check,
		ChevronRight,
		Download,
		FileCheck2,
		FileText,
		Landmark,
		ShieldCheck,
		ZoomIn
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { organizerStatus } from '$admin/utils/status';
	import { moneyCompact, num } from '$admin/utils/format';
	import type { AdminApprovalAttachment, AdminOrganizer } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import SearchField from '$components/SearchField.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let override = $state<string | null>(null);
	let note = $state('');
	let busy = $state(false);
	let previewAttachment = $state<AdminApprovalAttachment | null>(null);

	const selected = $derived<AdminOrganizer | null>(
		data.table.rows.find((org) => org.id === (override ?? data.selectedId)) ?? data.selected
	);
	const pipeline = $derived(selected ? (data.pipelines[selected.id] ?? []) : []);

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
		const payload = (await response.json().catch(() => ({}))) as { message?: string };
		busy = false;
		if (!response.ok) {
			toasts.error('Organizer update failed', payload.message ?? 'Your role may not permit this change.');
			return;
		}
		toasts.ok(
			status === 'verified'
				? 'Organizer verified & enabled'
				: status === 'suspended'
					? 'Organizer disabled & payouts frozen'
					: 'Organizer status updated',
			`${selected.name} · audit trail recorded.`
		);
		note = '';
		await invalidateAll();
	}
</script>

<svelte:head><title>Organizers · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Organizer Management"
		subtitle="Inspect full unredacted organizer KYB identity, 10-digit NUBAN settlement bank accounts, verify hosts, or disable/enable organizer accounts."
		crumbs={['platform', 'organizers']}
		eyebrow="Supabase · live organizers"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/organizers" download>
				<Download size={12} /> Export Organizers CSV
			</a>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div class="panel border border-rose-500/30 p-4 text-[11px] text-rose-200">
			{data.error}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total organizers</p><Building2 size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Organizer profiles & event owners</p>
		</div>
		<div class="panel border-amber-400/20 bg-amber-400/[0.03] p-4">
			<div class="flex items-center justify-between"><p class="mono-label !text-amber-200/80">Pending verification</p><span class="status-dot !bg-amber-400"></span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-amber-100">{num(data.counts.pending)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Awaiting KYC / payout bank review</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Verified hosts</p><ShieldCheck size={13} class="text-emerald-400" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.verified)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Approved identity & bank payout</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Paid order volume</p><Landmark size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(data.counts.payoutVolumeNgn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Paid orders across organizer events</p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search by organizer name, email, legal name, ID…" class="xl:w-[320px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All</option>
					<option value="verified" selected={data.filters.status === 'verified'}>Verified</option>
					<option value="pending" selected={data.filters.status === 'pending'}>Pending</option>
					<option value="suspended" selected={data.filters.status === 'suspended'}>Disabled / Suspended</option>
				</select>
			</div>
			<a href="/organizers" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<div class="grid grid-cols-1 gap-2.5 min-[1360px]:grid-cols-[1.58fr_1fr]">
		<section class="panel min-w-0 overflow-hidden">
			<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
				<p class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">
					Organizer profiles <span class="text-[#54545f]">· {data.table.rows.length} of {data.table.total}</span>
				</p>
				<span class="chip chip-accent !h-[18px] !text-[8px]"><span class="status-dot !h-1 !w-1"></span> Live</span>
			</div>
			{#if data.table.rows.length === 0}
				<EmptyState title="No organizers matched" message="Try broadening your status or search query." />
			{:else}
				<div class="table-wrap">
					<table class="tbl tbl-tight">
						<thead>
							<tr>
								<th>Organizer</th>
								<th>Contact</th>
								<th>Bank & KYC</th>
								<th class="!text-right">GMV & events</th>
								<th class="!text-right">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each data.table.rows as org (org.id)}
								{@const meta = organizerStatus(org.status)}
								<tr data-selected={selected?.id === org.id}>
									<td class="min-w-[180px]">
										<div class="flex items-center gap-2.5">
											<Avatar name={org.name} size="sm" accent={org.status === 'verified'} />
											<div class="min-w-0">
												<button
													type="button"
													onclick={() => (override = org.id)}
													class="block max-w-[170px] truncate text-left text-[11.5px] font-medium text-[#ececf1] hover:text-[#c6bcff]"
												>
													{org.name}
												</button>
												<p class="mt-0.5 truncate font-code text-[8.5px] uppercase tracking-[0.06em] text-[#6f6f7b]">
													@{org.slug} · {org.city}
												</p>
											</div>
										</div>
									</td>
									<td>
										<p class="max-w-[180px] truncate font-code text-[10px] text-[#dcdce4]">{org.contactEmail || '—'}</p>
										<p class="font-code text-[8.5px] text-[#8f8f9b]">{org.contactPhone || '—'}</p>
									</td>
									<td>
										<div class="flex flex-wrap items-center gap-1">
											<StatusChip label={meta.label} tone={meta.tone} />
										</div>
										<p class="mt-0.5 truncate font-code text-[8.5px] text-[#a0a0ab]">
											{org.settlementBank && org.settlementAccountNumber
												? `${org.settlementBank} · ${org.settlementAccountNumber}`
												: 'No bank submitted'}
										</p>
									</td>
									<td class="num">
										<span class="whitespace-nowrap">{moneyCompact(org.grossVolumeNgn)}</span>
										<p class="truncate text-[8.5px] font-normal text-[#6f6f7b]">{org.eventsCount} events · {org.ticketsSold.toLocaleString('en-US')} sold</p>
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
							<p class="mono-label">Organizer KYB & payout dossier</p>
							<p class="mt-1 font-code text-[8.5px] text-[#6f6f7b]">@{selected.slug} · {selected.id.slice(0, 8)}</p>
						</div>
						<StatusChip label={meta.label} tone={meta.tone} />
					</div>

					<div class="space-y-3.5 p-4">
						<div>
							<h3 class="font-display text-[16px] font-semibold text-[#f0f0f5]">{selected.name}</h3>
							<p class="mt-0.5 text-[11px] text-[#a0a0ab]">Legal name: <span class="font-code text-[#ededf4]">{selected.legalName}</span></p>
							<p class="mt-1 font-code text-[9.5px] select-all text-[#c6bcff]">{selected.contactEmail || 'No email'}</p>
							<p class="font-code text-[9.5px] select-all text-[#a0a0ab]">{selected.contactPhone || 'No phone'}</p>
						</div>

						<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-3 text-[10.5px]">
							<div class="flex items-center justify-between">
								<p class="mono-label !text-[8px]">Unmasked bank & payout account</p>
								<span class="chip {selected.settlementState === 'linked' ? 'chip-ok' : selected.settlementState === 'frozen' ? 'chip-danger' : 'chip-warn'} !h-[16px] !text-[7.5px]">
									{selected.settlementState}
								</span>
							</div>
							<div class="mt-2 space-y-1">
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Bank</span><span class="font-code text-[#ededf4]">{selected.settlementBank || 'Not submitted'}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Account # (NUBAN)</span><span class="font-code font-semibold select-all text-emerald-300">{selected.settlementAccountNumber || 'Not submitted'}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Account holder</span><span class="font-code text-[#ededf4]">{selected.settlementAccountHolder || selected.name}</span></p>
							</div>
						</div>

						<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-3 text-[10.5px]">
							<p class="mono-label !text-[8px]">Unmasked identity / KYC</p>
							<div class="mt-2 space-y-1">
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Document</span><span class="font-code text-[#ededf4]">{selected.kycDocument || '—'}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">ID / NIN / BVN #</span><span class="font-code font-semibold select-all text-emerald-300">{selected.kycReference || '—'}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Date of birth</span><span class="font-code text-[#ededf4]">{selected.kycDateOfBirth || '—'}</span></p>
							</div>
							{#if selected.kycAttachments && selected.kycAttachments.length > 0}
								<div class="mt-2 grid grid-cols-2 gap-1.5 pt-1">
									{#each selected.kycAttachments as att}
										<button
											type="button"
											onclick={() => (previewAttachment = att)}
											class="flex items-center justify-between rounded border border-[#32323d] bg-[#131319] px-2 py-1.5 font-code text-[8.5px] text-[#c6bcff] hover:border-[#7c60f6]"
										>
											<span class="truncate">{att.side.toUpperCase()} ID</span>
											{#if att.mimeType.startsWith('image/')}
												<ZoomIn size={11} />
											{:else}
												<FileText size={11} />
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<div>
							<p class="mono-label !text-[8px]">Organizer events ({selected.eventsCount})</p>
							{#if pipeline.length > 0}
								<div class="mt-1.5 space-y-1.5">
									{#each pipeline as event}
										<a href={`/events/${event.id}`} class="flex items-center justify-between gap-2 rounded-md border border-[#292930] px-2.5 py-1.5 hover:bg-[#1e1e25]">
											<span class="truncate text-[10.5px] text-[#c9c9d4]">{event.title}</span>
											<span class="font-code text-[8.5px] text-[#8f8f9b]">{num(event.sold)} sold</span>
										</a>
									{/each}
								</div>
							{:else}
								<p class="mt-1.5 text-[10px] text-[#6f6f7b]">No events created yet.</p>
							{/if}
						</div>

						<div>
							<label class="field-label" for="kyb-note">Decision / suspension note</label>
							<textarea
								id="kyb-note"
								class="textarea !min-h-[56px] !text-[11px]"
								bind:value={note}
								placeholder="Compliance note or reason for verifying / disabling this organizer…"
							></textarea>
						</div>

						<div class="space-y-1.5">
							{#if selected.status !== 'verified'}
								<button
									type="button"
									class="btn btn-primary w-full !text-[12px]"
									disabled={busy}
									onclick={() => apply('verified', note || 'Organizer identity & payout account verified by Admin.')}
								>
									<BadgeCheck size={13} /> Verify & Enable Organizer
								</button>
							{/if}
							{#if selected.status !== 'suspended'}
								<button
									type="button"
									class="btn btn-sm btn-danger-soft w-full"
									disabled={busy}
									onclick={() => apply('suspended', note || 'Organizer account disabled and live events suspended.')}
								>
									<Ban size={12} /> Disable organizer & freeze payouts
								</button>
							{:else}
								<button
									type="button"
									class="btn btn-sm btn-primary w-full"
									disabled={busy}
									onclick={() => apply('pending', note || 'Organizer account re-enabled.')}
								>
									<Check size={12} /> Re-enable organizer account
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>

<Sheet
	open={previewAttachment !== null}
	title={previewAttachment ? `${previewAttachment.side.toUpperCase()} ID · ${previewAttachment.name}` : 'ID Document'}
	subtitle="Uploaded KYC identity document"
	onclose={() => (previewAttachment = null)}
	width="680px"
>
	{#if previewAttachment?.dataUrl}
		<div class="space-y-3">
			{#if previewAttachment.mimeType.startsWith('image/')}
				<img src={previewAttachment.dataUrl} alt={previewAttachment.name} class="max-h-[72vh] w-full rounded-lg border border-[#2d2d37] bg-black object-contain" />
			{:else}
				<iframe src={previewAttachment.dataUrl} title={previewAttachment.name} class="h-[70vh] w-full rounded-lg border border-[#2d2d37] bg-white"></iframe>
			{/if}
			<div class="flex justify-end gap-2">
				<a href={previewAttachment.dataUrl} download={previewAttachment.name} class="btn btn-sm btn-primary">
					<Download size={12} /> Download original
				</a>
			</div>
		</div>
	{/if}
</Sheet>

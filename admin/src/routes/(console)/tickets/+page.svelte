<script lang="ts">
	import {
		Ban,
		Download,
		Eye,
		FileJson,
		Fingerprint,
		Printer,
		QrCode,
		RefreshCw,
		RotateCcw,
		ShieldCheck,
		Ticket as TicketIcon
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, ticketStatus } from '$admin/utils/status';
	import { money, num, pct, relative } from '$admin/utils/format';
	import type { AdminTicket } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import SearchField from '$components/SearchField.svelte';
	import QrPass from '$components/QrPass.svelte';
	import CopyButton from '$components/CopyButton.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let override = $state<string | null>(null);
	let voidOpen = $state(false);
	let reason = $state('');
	let busy = $state(false);

	const selected = $derived<AdminTicket | null>(
		data.table.rows.find((ticket) => ticket.id === (override ?? data.selectedId)) ??
			data.selected ??
			data.table.rows[0] ??
			null
	);

	function select(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	async function runAction(action: 'void' | 'reissue', note: string) {
		if (!selected) return;
		busy = true;
		const response = await fetch(`/api/tickets/${selected.id}/actions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action, reason: note })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Pass action failed', 'Your role may not permit this operation.');
			return;
		}
		toasts.ok(
			action === 'void' ? 'Pass revoked' : 'Pass re-issued',
			action === 'void'
				? `${selected.code} is void. Wallet passes will refresh within 30 seconds.`
				: `A replacement pass was minted for ${selected.holderName} — the previous code is void.`
		);
		voidOpen = false;
		reason = '';
		await invalidateAll();
	}

	function exportJson() {
		if (!selected) return;
		const blob = new Blob(
			[JSON.stringify({ exportedAt: new Date().toISOString(), ticket: selected }, null, 2)],
			{
			type: 'application/json'
			}
		);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${selected.code}-audit.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Tickets · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Tickets Management"
		subtitle="Search, inspect, and manage digital passes, re-issue history, and attendee allocations."
		crumbs={['ticketing & ops', 'tickets']}
		eyebrow="Verified pass registry"
	>
		{#snippet actions()}
			<a class="btn btn-sm btn-primary" href="/api/export/tickets" download>
				<Download size={12} /> Export Manifest (CSV)
			</a>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total minted passes</p><TicketIcon size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Across active published events</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active passes</p><ShieldCheck size={13} class="text-emerald-400" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">
				{num(data.counts.valid)}
				<span class="font-code text-[10px] font-normal text-emerald-300">{pct(data.counts.total ? (data.counts.valid / data.counts.total) * 100 : 0)}</span>
			</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Share of the live ledger</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Pass value</p><Fingerprint size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{money(data.counts.valueNgn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Face value · avg {money(data.counts.avgPriceNgn)}</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Revoked / voided</p><Ban size={13} class="text-red-400" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.revoked)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Voided, refunded & transferred</p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search by code #OWL-2026-AI-9942, attendee, order…" class="xl:w-[320px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				<select name="eventId" class="select !h-[34px] !text-[11.5px]" onchange={select} aria-label="Filter by event">
					<option value="all" selected={data.filters.eventId === 'all'}>Event: All active</option>
					{#each data.events as item}
						<option value={item.id} selected={data.filters.eventId === item.id}>{item.title}</option>
					{/each}
				</select>
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={select} aria-label="Filter by ticket status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All passes</option>
					<option value="valid" selected={data.filters.status === 'valid'}>Valid · unused</option>
					<option value="void" selected={data.filters.status === 'void'}>Void</option>
					<option value="refunded" selected={data.filters.status === 'refunded'}>Refunded</option>
					<option value="transferred" selected={data.filters.status === 'transferred'}>Transferred</option>
				</select>
				<select class="select !h-[34px] !text-[11.5px]" aria-label="Filter by tier">
					<option>Tier: All access levels</option>
					<option>VIP Full Access</option>
					<option>Standard Pass</option>
					<option>Speaker Pass</option>
				</select>
			</div>
			<a href="/tickets" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<div class="grid grid-cols-1 gap-2.5 xl:grid-cols-[390px_1fr]">
		<!-- Inspector -->
		<section>
			{#if selected}
				{@const meta = ticketStatus(selected.status)}
				<div class="panel sticky top-[76px] overflow-hidden">
					<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
						<p class="mono-label">Inspecting pass allocation</p>
						<StatusChip label={meta.label} tone={meta.tone} dot />
					</div>
					<div class="p-4">
						<div class="flex items-center gap-2">
							<p class="font-code text-[12px] font-medium tracking-[0.04em] text-[#ececf1]">{selected.code}</p>
							<CopyButton value={selected.code} label="Copy code" compact />
						</div>

						<div class="mt-3 rounded-xl border border-[#2a2a32] bg-[#141419] p-3">
							<div class="mb-2.5 flex items-center justify-between">
								<p class="mono-label !text-[8px]">Attendee pass QR</p>
								<span class="chip chip-accent !h-[17px] !text-[8px] flex items-center gap-1"><RefreshCw size={8} /> {selected.status === 'valid' ? 'Active' : 'Inactive'}</span>
							</div>
							<QrPass payload={`owltside://t/${selected.code}`} size={182} />
							<div class="mt-3 flex items-center justify-between gap-2 border-t border-[#2a2a32] pt-2.5">
								<p class="min-w-0 truncate font-code text-[8.5px] text-[#8f8f9b]">
									<span class="text-[#5d5d69]">PASS</span> {selected.code} · {selected.tierName}
								</p>
								<CopyButton value={`owltside://t/${selected.code}`} label="Copy pass link" compact />
							</div>
						</div>

						<div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
							<div>
								<p class="mono-label !text-[7.5px]">Attendee name</p>
								<p class="mt-0.5 text-[11.5px] font-medium text-[#ececf1]">{selected.holderName}</p>
								<p class="font-code text-[8.5px] text-[#6f6f7b]">@{selected.holderHandle}</p>
							</div>
							<div>
								<p class="mono-label !text-[7.5px]">Pass category</p>
								<p class="mt-0.5 text-[11.5px] font-medium text-[#ececf1]">{selected.tierName}</p>
								<p class="font-code text-[8.5px] text-[#6f6f7b]">{selected.seat ?? 'General admission'}</p>
							</div>
							<div>
								<p class="mono-label !text-[7.5px]">Assigned event</p>
								<p class="mt-0.5 text-[11px] text-[#dcdce4]">{selected.eventTitle}</p>
							</div>
							<div>
								<p class="mono-label !text-[7.5px]">Order & settlement</p>
								<p class="mt-0.5 text-[11px] text-[#dcdce4]">{money(selected.priceNgn)}</p>
								<p class="font-code text-[8.5px] text-[#6f6f7b]">{selected.orderRef} · {selected.settlement}</p>
							</div>
						</div>

						<div class="mt-3 space-y-1.5 border-t border-[#26262e] pt-3 text-[10px]">
							<p class="flex items-center justify-between"><span class="flex items-center gap-1.5 text-[#8f8f9b]"><QrCode size={11} /> Wallet delivery</span><span class="font-code text-emerald-300">Apple / Google</span></p>
							<p class="flex items-center justify-between"><span class="flex items-center gap-1.5 text-[#8f8f9b]"><RefreshCw size={11} /> Re-issues</span><span class="font-code text-[#c9c9d4]">{selected.reissueCount ?? 0}{selected.reissuedAt ? ` · ${relative(selected.reissuedAt)}` : ''}</span></p>
							<p class="flex items-center justify-between"><span class="text-[#8f8f9b]">Issued to</span><span class="font-code text-[#c9c9d4]">@{selected.holderHandle}</span></p>
							<p class="flex items-center justify-between"><span class="text-[#8f8f9b]">Purchased</span><span class="font-code text-[#c9c9d4]">{relative(selected.purchasedAt)}</span></p>
						</div>

						{#if selected.flags?.length}
							<div class="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] p-2.5">
								<p class="mono-label !text-[7.5px] !text-red-200">Risk flags</p>
								{#each selected.flags as flag}
									<p class="mt-0.5 text-[10px] text-red-100/80">• {flag}</p>
								{/each}
							</div>
						{/if}

						<div class="mt-3">
							<p class="mono-label !text-[8px]">Operational actions</p>
							<div class="mt-1.5 grid grid-cols-2 gap-1.5">
								<button type="button" class="btn btn-sm justify-start" disabled={busy} onclick={() => runAction('reissue', 'Pass re-issued by operations')}>
									<RotateCcw size={11} /> Re-issue pass
								</button>
								<button type="button" class="btn btn-sm justify-start" onclick={() => toasts.info('Badge print queued', `Physical badge for ${selected.holderName} queued for print.`)}>
									<Printer size={11} /> Print VIP badge
								</button>
								<button type="button" class="btn btn-sm justify-start" onclick={exportJson}>
									<FileJson size={11} /> Audit log (JSON)
								</button>
								<button type="button" class="btn btn-sm btn-danger justify-start" onclick={() => (voidOpen = true)}>
									<Ban size={11} /> Revoke pass
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</section>

		<!-- Registry -->
		<div class="min-w-0 space-y-2.5">
			<section class="panel overflow-hidden">
				<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
					<div class="flex items-center gap-2">
						<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Ticket Registry</h2>
						<span class="font-code text-[8.5px] text-[#54545f]">{data.table.rows.length} of {num(data.table.total)} rows</span>
					</div>
					<div class="flex items-center gap-1">
						<button type="button" class="row-action" aria-label="Export registry" onclick={() => (window.location.href = '/api/export/tickets')}><Download size={13} /></button>
						<button type="button" class="row-action" aria-label="Refresh registry" onclick={() => invalidateAll()}><RefreshCw size={13} /></button>
					</div>
				</div>
				<div class="table-wrap">
					<table class="tbl">
						<thead>
							<tr><th>Ticket ref</th><th>Attendee</th><th>Tier & seat</th><th>Settlement</th><th>Status</th><th class="!text-right">Actions</th></tr>
						</thead>
						<tbody>
							{#each data.table.rows as ticket (ticket.id)}
								{@const s = ticketStatus(ticket.status)}
								<tr data-selected={selected?.id === ticket.id}>
									<td class="whitespace-nowrap">
										<button type="button" class="font-code text-[10.5px] text-[#c6bcff] hover:underline" onclick={() => (override = ticket.id)}>
											{ticket.code}
										</button>
										<p class="mt-0.5 font-code text-[8px] uppercase tracking-[0.06em] text-[#5d5d69]">{ticket.orderRef}</p>
									</td>
									<td>
										<p class="primary-cell text-[11px]">{ticket.holderName}</p>
										<p class="text-[9px] text-[#6f6f7b]">@{ticket.holderHandle}</p>
									</td>
									<td>
										<p class="text-[10.5px] text-[#d4d4dc]">{ticket.tierName}</p>
										<p class="font-code text-[8.5px] text-[#6f6f7b]">{ticket.seat ?? 'GA'}</p>
									</td>
									<td>
										<p class="text-[10px] text-[#c9c9d4]">{money(ticket.priceNgn)}</p>
										<p class="font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">{ticket.settlement}</p>
									</td>
									<td>
										<StatusChip label={s.label} tone={s.tone} />
										<p class="mt-1 font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">
											{ticket.reissueCount ? `Re-issued ×${ticket.reissueCount}` : `Issued ${relative(ticket.purchasedAt)}`}
										</p>
									</td>
									<td>
										<div class="flex justify-end gap-1">
											<button type="button" class="row-action" aria-label={`Inspect ${ticket.code}`} onclick={() => (override = ticket.id)}><Eye size={13} /></button>
											<button type="button" class="row-action" aria-label="Print badge" onclick={() => toasts.info('Badge print queued', ticket.holderName)}><Printer size={13} /></button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<Pagination pageNumber={data.table.page} pages={data.table.pages} total={data.table.total} perPage={data.table.perPage} label="passes" />
			</section>

		</div>
	</div>
</div>

<Sheet open={voidOpen} title="Revoke pass" subtitle="This voids the pass on every device and in both mobile wallets." onclose={() => (voidOpen = false)} width="430px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); runAction('void', reason || 'Pass revoked by admin'); }}>
		<div class="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5 text-[10.5px] leading-relaxed text-red-100/80">
			{selected?.code} · {selected?.holderName}. The attendee will no longer be able to redeem this pass. Refunds must be issued separately.
		</div>
		<label class="field-label" for="void-reason">Reason</label>
		<textarea id="void-reason" class="textarea" bind:value={reason} required placeholder="e.g. Duplicate QR presentation — pass screenshot shared publicly."></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (voidOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>Revoke pass now</button>
		</div>
	</form>
</Sheet>

<script lang="ts">
	import {
		AlertTriangle,
		Ban,
		CheckCircle2,
		ChevronRight,
		Download,
		Eye,
		FileJson,
		Receipt,
		RefreshCw,
		RotateCcw,
		ShieldCheck,
		Wallet
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, orderStatus } from '$admin/utils/status';
	import { dateTime, money, time } from '$admin/utils/format';
	import type { AdminOrder } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import SearchField from '$components/SearchField.svelte';
	import CopyButton from '$components/CopyButton.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let override = $state<string | null>(null);
	let refundOpen = $state(false);
	let reason = $state('Attendee requested reversal — verified against gateway ledger.');
	let busy = $state(false);

	const selected = $derived<AdminOrder | null>(
		data.table.rows.find((order) => order.id === (override ?? data.selectedId)) ?? data.selected ?? data.table.rows[0] ?? null
	);

	function change(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	async function refund() {
		if (!selected) return;
		busy = true;
		const response = await fetch(`/api/orders/${selected.id}/refund`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ reason })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Reversal declined', 'Only settled orders can be reversed. Check your tier privileges.');
			return;
		}
		const payload = (await response.json()) as { refund: { orderRef: string } };
		toasts.ok('Refund initiated', `${payload.refund.orderRef} queued for Paystack reversal.`);
		refundOpen = false;
		await invalidateAll();
	}

	const settlementSplit = $derived.by(() => {
		if (!selected) return null;
		const organizer = Math.round(selected.subtotalNgn * 0.92);
		const platform = selected.subtotalNgn - organizer;
		const gateway = Math.round(selected.subtotalNgn * 0.015);
		return { organizer, platform, gateway };
	});
</script>

<svelte:head><title>Orders & Transactions · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Orders &amp; Transactions"
		subtitle="Real-time payment settlements, Paystack transaction logs, webhook verification, and attendee order records."
		crumbs={['ticketing & ops', 'orders']}
		eyebrow="Live Paystack feed"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/orders" download><Download size={12} /> Export Transactions CSV</a>
			<button type="button" class="btn btn-sm btn-primary" onclick={() => toasts.ok('Reconciliation queued', 'Settlement batch OWT-1021 will reconcile at 02:00 WAT.')}>
				<RotateCcw size={12} /> Reconcile Settlement Batch
			</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Gross processed volume</p><Receipt size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">
				{money(data.financials.grossNgn)}
			</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">4,912 total txns <span class="text-emerald-300">+18.4%</span></p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Verified settlements</p><CheckCircle2 size={13} class="text-emerald-400" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{money(data.financials.settledNgn)}</p>
			<div class="mt-2 meter"><div class="meter-fill meter-ok" style="width:95.5%"></div></div>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">{data.financials.settledPct}% net</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Pending / in-flight</p><RefreshCw size={13} class="text-amber-300" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{money(data.financials.pendingNgn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{data.counts.pending} checkouts active</p>
			<p class="mt-0.5 font-code text-[8.5px] uppercase text-[#6f6f7b]">3DS / webhook wait</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Failed / blocked</p><AlertTriangle size={13} class="text-red-400" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{money(data.financials.failedNgn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{data.counts.failed} dropouts · 0 disputes</p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search order ref, customer, email or event…" class="xl:w-[300px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All active & historical</option>
					<option value="settled" selected={data.filters.status === 'settled'}>Settled</option>
					<option value="pending" selected={data.filters.status === 'pending'}>Pending</option>
					<option value="failed" selected={data.filters.status === 'failed'}>Failed</option>
					<option value="refunded" selected={data.filters.status === 'refunded'}>Refunded</option>
				</select>
				<select name="method" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by method">
					<option value="all" selected={data.filters.method === 'all'}>All methods: Card, transfer, USD</option>
					{#each data.methods as method}
						<option value={method} selected={data.filters.method === method}>{method}</option>
					{/each}
				</select>
				<span class="chip !h-[34px] justify-center !text-[9px]">Last 30 days</span>
			</div>
			<a href="/orders" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<div class="grid grid-cols-1 gap-2.5 min-[1400px]:grid-cols-[1.55fr_1fr]">
		<section class="panel min-w-0 overflow-hidden">
			<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
				<div class="flex items-center gap-2">
					<p class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">Transaction ledger records</p>
					<span class="chip !h-[18px] !text-[8px]">{data.table.total.toLocaleString('en-US')} entries</span>
				</div>
				<span class="inline-flex items-center gap-1.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
					<span class="status-dot !h-1 !w-1"></span> Live · poll 5s
					<button type="button" class="row-action !h-6 !w-6" aria-label="Refresh" onclick={() => invalidateAll()}><RefreshCw size={11} /></button>
				</span>
			</div>
			<div class="table-wrap">
				<table class="tbl">
					<thead><tr><th>Order ID</th><th>Customer</th><th>Target event</th><th class="hidden min-[1400px]:table-cell">Tier &amp; qty</th><th class="hidden min-[1600px]:table-cell">Rail</th><th class="!text-right">Gross</th><th>Status</th></tr></thead>
					<tbody>
						{#each data.table.rows as order (order.id)}
							{@const meta = orderStatus(order.status)}
							<tr data-selected={selected?.id === order.id}>
								<td class="whitespace-nowrap"><button type="button" class="font-code text-[10px] text-[#c6bcff] hover:underline" onclick={() => (override = order.id)}>{order.reference}</button></td>
								<td>
									<p class="primary-cell text-[10.5px]">{order.customerName}</p>
									<p class="max-w-[124px] truncate font-code text-[8.5px] text-[#6f6f7b]">{order.customerEmail}</p>
								</td>
								<td class="max-w-[124px] truncate text-[10.5px]">{order.eventTitle}</td>
								<td class="hidden max-w-[128px] truncate whitespace-nowrap text-[10.5px] min-[1400px]:table-cell">{order.tierLabel}</td>
								<td class="hidden max-w-[92px] truncate font-code text-[8.5px] uppercase tracking-[0.03em] text-[#8f8f9b] min-[1600px]:table-cell">{order.method}</td>
								<td class="num">{money(order.totalNgn)}</td>
								<td>
									<span class={chipClass(meta.tone)}>{meta.label}</span>
									<p class="mt-0.5 font-code text-[8px] text-[#5d5d69]">{time(order.createdAt)}</p>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<Pagination pageNumber={data.table.page} pages={data.table.pages} total={data.table.total} perPage={data.table.perPage} label="records" />
		</section>

		<aside class="min-w-0">
			{#if selected}
				{@const meta = orderStatus(selected.status)}
				<div class="panel sticky top-[76px] overflow-hidden">
					<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
						<p class="mono-label">Transaction dossier</p>
						<StatusChip label={meta.label} tone={meta.tone} dot />
					</div>
					<div class="p-4">
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="font-code text-[8px] uppercase tracking-[0.1em] text-[#6f6f7b]">Order reference</p>
								<h3 class="mt-1 font-display text-[18px] font-semibold text-[#f0f0f5]">{selected.reference}</h3>
								<p class="mt-0.5 font-code text-[8.5px] text-[#6f6f7b]">{dateTime(selected.createdAt)}</p>
							</div>
							<CopyButton value={selected.reference} compact label="Copy order reference" />
						</div>

						<div class="mt-3 border-t border-[#26262e] pt-3">
							<p class="mono-label !text-[8px]">Itemization & splits</p>
							<div class="mt-1.5 space-y-1 text-[10.5px]">
								{#each selected.items as item}
									<p class="flex justify-between gap-2 text-[#b7b7c2]"><span>{item.label}</span><span class="font-code text-[#dcdce4]">{money(item.qty * item.unitNgn)}</span></p>
								{/each}
								<p class="flex justify-between gap-2 text-[#8f8f9b]"><span>Platform protocol service fee</span><span class="font-code text-[#dcdce4]">{money(selected.feeNgn)}</span></p>
								{#if selected.promo}
									<p class="flex justify-between gap-2 text-emerald-300"><span>Promo · {selected.promo.code}</span><span class="font-code">-{money(selected.promo.discountNgn)}</span></p>
								{/if}
							</div>
							<div class="mt-2 flex items-baseline justify-between border-t border-[#2a2a32] pt-2">
								<span class="text-[10.5px] text-[#8f8f9b]">Net charged total</span>
								<span class="font-display text-[16px] font-semibold text-[#f0f0f5]">{money(selected.totalNgn)}</span>
							</div>
						</div>

						<div class="mt-3 border-t border-[#26262e] pt-3">
							<p class="mono-label !text-[8px]">Attendee credentials</p>
							<div class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
								<div><p class="text-[#6f6f7b]">Full name</p><p class="text-[#dcdce4]">{selected.customerName}</p></div>
								<div><p class="text-[#6f6f7b]">Billing email</p><p class="truncate font-code text-[9px] text-[#dcdce4]">{selected.customerEmail}</p></div>
								<div><p class="text-[#6f6f7b]">Phone verified</p><p class="font-code text-[9px] text-[#dcdce4]">{selected.customerPhone}</p></div>
								<div><p class="text-[#6f6f7b]">IP geo origin</p><p class="text-[#dcdce4]">Victoria Island, Lagos <span class="font-code text-[8px] text-[#6f6f7b]">({selected.ipCountry})</span></p></div>
							</div>
						</div>

						<div class="mt-3 border-t border-[#26262e] pt-3">
							<p class="mono-label !text-[8px]">Payment verification & rails</p>
							<div class="mt-1.5 space-y-1 text-[10px]">
								<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Paystack Trx ID</span><span class="font-code text-[9px] text-[#dcdce4]">trx_live_{selected.id.slice(-6)}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Card token auth</span><span class="font-code text-[9px] text-[#dcdce4]">AUTH_804ff7b2c9e</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Settlement card</span><span class="text-[#dcdce4]">GTBank Mastercard (NG)</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Webhook event</span><span class="font-code text-[9px] text-emerald-300">charge.success (200 OK)</span></p>
								<p class="flex items-center justify-between gap-2"><span class="text-[#6f6f7b]">HMAC signature</span><span class="font-code text-[9px] text-[#dcdce4]">sha512:9b840d…bf</span></p>
							</div>
						</div>

						{#if settlementSplit}
							<div class="mt-3 rounded-lg border border-[#2a2a32] bg-[#18181e] p-3">
								<p class="mono-label !text-[8px]">Automated settlement split</p>
								<div class="mt-1.5 space-y-1 text-[10px]">
									<p class="flex justify-between gap-2"><span class="text-[#a0a0ab]">Organizer share (92.0%)</span><span class="font-code text-[#dcdce4]">{money(settlementSplit.organizer)}</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#a0a0ab]">Owltside platform take (8.0%)</span><span class="font-code text-[#dcdce4]">{money(settlementSplit.platform)}</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#a0a0ab]">Paystack gateway processing</span><span class="font-code text-[#dcdce4]">{money(settlementSplit.gateway)}</span></p>
									<p class="flex justify-between gap-2 border-t border-[#2a2a32] pt-1"><span class="text-[#6f6f7b]">Subaccount</span><span class="font-code text-[#8f8f9b]">{selected.subaccount}</span></p>
								</div>
							</div>
						{/if}

						<div class="mt-3 space-y-1.5">
							<button type="button" class="btn btn-sm w-full" onclick={() => toasts.info('Receipt generated', 'Settlement receipt PDF queued for download.')}>
								<Download size={12} /> Download settlement receipt (PDF)
							</button>
							<div class="grid grid-cols-2 gap-1.5">
								<button type="button" class="btn btn-sm justify-start" onclick={() => toasts.info('Webhook log', 'Signed payload history opened in audit trail.')}>
									<FileJson size={11} /> Webhook log
								</button>
								<button type="button" class="btn btn-sm btn-danger justify-start" disabled={selected.status !== 'settled'} onclick={() => (refundOpen = true)}>
									<RotateCcw size={11} /> Issue refund
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>

	<!-- Webhook stream -->
	<section class="panel overflow-hidden">
		<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
			<div class="flex items-center gap-2">
				<span class="status-dot !h-1.5 !w-1.5"></span>
				<p class="font-code text-[9px] uppercase tracking-[0.12em] text-[#9c9ca8]">Settlement & webhook dispatch stream</p>
			</div>
			<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#54545f]">Node: wat-ingress-02</span>
		</div>
		<div class="overflow-x-auto bg-[#0c0c10] px-4 py-3 font-code text-[9.5px] leading-relaxed text-[#8f8f9b]">
			<p><span class="text-[#5d5d69]">{time(new Date().toISOString())}</span> <span class="text-emerald-300">[HTTP 200]</span> POST /v1/webhooks/paystack/charge.success <span class="text-[#c9c9d4]">order_ref: {selected?.reference ?? 'ORD-9942-NG'}</span> subaccount: {selected?.subaccount ?? 'ACCT_saharatech'}</p>
			<p><span class="text-[#5d5d69]">{time(new Date(Date.now() - 90_000).toISOString())}</span> <span class="text-emerald-300">[HTTP 200]</span> POST /v1/webhooks/paystack/dedicated_account.assign <span class="text-[#c9c9d4]">order_ref: ORD-9941-NG</span> bank: Zenith Bank</p>
			<p><span class="text-[#5d5d69]">{time(new Date(Date.now() - 240_000).toISOString())}</span> <span class="text-red-300">[HTTP 422]</span> POST /v1/webhooks/paystack/charge.timeout <span class="text-[#c9c9d4]">order_ref: ORD-9937-NG</span> <span class="text-[#6f6f7b]">reason: 3DS challenge not fulfilled within 3s</span></p>
			<p class="mt-1 flex items-center gap-1.5 text-[#6f6f7b]"><span class="animate-pulse-soft">▌</span> streaming live · signature verified · poll 5s</p>
		</div>
	</section>
</div>

<Sheet open={refundOpen} title="Issue refund reversal" subtitle="Funds are returned to the original payment method via Paystack." onclose={() => (refundOpen = false)} width="440px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); refund(); }}>
		<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-3 text-[10.5px]">
			<p class="flex justify-between"><span class="text-[#8f8f9b]">Order</span><span class="font-code text-[#dcdce4]">{selected?.reference}</span></p>
			<p class="mt-1 flex justify-between"><span class="text-[#8f8f9b]">Amount</span><span class="font-code text-[#dcdce4]">{selected ? money(selected.totalNgn) : '—'}</span></p>
			<p class="mt-1 flex justify-between"><span class="text-[#8f8f9b]">Customer</span><span class="text-[#dcdce4]">{selected?.customerName}</span></p>
		</div>
		<label class="field-label" for="refund-reason">Reversal reason</label>
		<textarea id="refund-reason" class="textarea" bind:value={reason} required></textarea>
		<p class="font-code text-[8px] uppercase leading-relaxed tracking-[0.08em] text-[#6f6f7b]">
			Requires Tier 1 privileges · writes to the immutable audit ledger.
		</p>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (refundOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>Confirm reversal</button>
		</div>
	</form>
</Sheet>

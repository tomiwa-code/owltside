<script lang="ts">
	import {
		ArrowDownToLine,
		BadgeCheck,
		CalendarRange,
		ChevronLeft,
		ChevronRight,
		Download,
		Gauge,
		Landmark,
		RefreshCw,
		SlidersHorizontal,
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, settlementState } from '$admin/utils/status';
	import { money, moneyCompact, num, pct, shortDate } from '$admin/utils/format';
	import type { SettlementsData } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import KpiCard from '$components/KpiCard.svelte';
	import RevenueChart from '$components/RevenueChart.svelte';
	import Avatar from '$components/Avatar.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let page = $state(1);
	let status = $state('all');
	let busy = $state(false);
	let configOpen = $state(false);

	const settlements = $derived<SettlementsData>(data.settlements ?? {
		range: { from: '', to: '' }, grossNgn: 0, grossDelta: 0, settledNgn: 0, settledPct: 0,
		commissionNgn: 0, commissionRate: 0, escrowNgn: 0, escrowEvents: 0, refundedNgn: 0,
		refundedPct: 0, velocity: [], rows: [], totalProfiles: 0, totalSubaccounts: 0
	});
	const perPage = 6;
	const safeRows = $derived(settlements.rows ?? []);
	const rows = $derived(
		safeRows
			.filter((row) => (status === 'all' ? true : row.state === status))
	);
	const pages = $derived(Math.max(1, Math.ceil(rows.length / perPage)));
	const visible = $derived(rows.slice((page - 1) * perPage, page * perPage));
	const cleared = $derived(safeRows.filter((row) => row.state === 'settled' || row.state === 'next_batch'));
	const clearedValue = $derived(cleared.reduce((sum, row) => sum + row.payoutNgn, 0));
	const safePeak = $derived(data.peaks?.peakDay ?? { day: new Date().toISOString().slice(0, 10), grossNgn: 0, payoutNgn: 0 });
	const safeVelocity = $derived((settlements.velocity ?? []).length ? settlements.velocity : [{ day: new Date().toISOString().slice(0, 10), grossNgn: 0, payoutNgn: 0 }]);

	const gatewayRails = [
		{ label: 'Cards', detail: 'Paystack direct', share: 74.0 },
		{ label: 'Transfers', detail: 'Instant NIP/NGN', share: 18.0 },
		{ label: 'USD / Virtual', detail: 'Subaccounts', share: 8.0 }
	];

	async function reconcile() {
		busy = true;
		const response = await fetch('/api/settlements/reconcile', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({})
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Batch release blocked', 'No cleared profiles or your tier cannot disburse.');
			return;
		}
		const payload = (await response.json()) as { count: number; totalNgn: number };
		toasts.ok('Settlement batch released', `${payload.count} subaccounts · ${money(payload.totalNgn)} queued with Paystack.`);
		await invalidateAll();
	}

	function setStatusFilter(event: Event) {
		status = (event.currentTarget as HTMLSelectElement).value;
		page = 1;
	}
</script>

<svelte:head><title>Financial Analytics · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Financial Analytics & Settlements"
		subtitle="Gross ticketing revenue, escrow settlement balances, platform commission yield, and Paystack payout velocity across high-volume organizers."
		crumbs={['finance', 'analytics-and-settlements']}
		eyebrow="Treasury v2.4"
	>
		{#snippet meta()}
			<span class="chip chip-ok !h-[18px] !text-[7.5px]">Paystack rails active · NGN auto-batch 02:00 UTC</span>
		{/snippet}
		{#snippet actions()}
			<a class="btn btn-sm" href="/approvals"><RefreshCw size={12} /> Payout requests →</a>
			<a class="btn btn-sm" href="/api/export/settlements" download><Download size={12} /> Export statement</a>
			<button type="button" class="btn btn-sm" onclick={() => (configOpen = true)}><SlidersHorizontal size={12} /> Settlement config</button>
			<button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={reconcile}>
				<RefreshCw size={12} /> Reconcile cleared batch ({data.eligible})
			</button>
		{/snippet}
	</PageHeader>

	{#if data.notProvisioned && data.notice}
		<div class="panel border border-amber-400/30 bg-amber-400/[0.04] p-4 text-[11.5px] text-amber-100">
			<div class="flex items-start gap-2">
				<Landmark size={14} class="mt-0.5 shrink-0 text-amber-300" />
				<div>
					<p class="font-display text-[13px] font-semibold">Settlement rail not provisioned</p>
					<p class="mt-0.5 text-[#d8cc8e]">{data.notice}</p>
				</div>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-5">
		<KpiCard label="Gross ticketing (GMV)" value={money(settlements.grossNgn)} delta={`+${settlements.grossDelta}%`} sub="vs prior window" />
		<KpiCard label="Net escrow settled" value={money(settlements.settledNgn)} sub={`${pct(settlements.settledPct)} post-reversals`} progress={settlements.settledPct} progressTone="ok" />
		<KpiCard label="Platform commission" value={money(settlements.commissionNgn)} sub={`${settlements.commissionRate}% take rate`} footnote="+₦1.12M" />
		<KpiCard label="Organizer held escrow" value={money(settlements.escrowNgn)} sub={`${settlements.escrowEvents} events queued`} />
		<KpiCard label="Processed refunds" value={money(settlements.refundedNgn)} sub={`${pct(settlements.refundedPct)} across 4,820 tickets`} />
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.55fr_1fr]">
		<section class="panel overflow-hidden">
			<header class="panel-head">
				<div>
					<h2 class="font-display text-[13px] font-semibold text-[#f0f0f5]">Revenue velocity & payout escrow</h2>
					<p class="mt-0.5 text-[10px] text-[#6f6f7b]">Daily gross ticketing peak vs Paystack subaccount direct disbursement release.</p>
				</div>
				<div class="flex items-center gap-2 font-code text-[7.5px] uppercase tracking-[0.06em] text-[#8f8f9b]">
					<span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-sm bg-[#c6bcff]"></span> Gross GMV</span>
					<span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-sm bg-[#8dd3c7]"></span> Payouts</span>
					<span class="chip !h-[18px] !text-[7.5px]">30-day dual axis</span>
				</div>
			</header>
			<div class="p-4">
				<div class="flex items-end justify-between gap-4">
					<div>
						<p class="mono-label !text-[7.5px]">Peak velocity day</p>
					<p class="mt-1 font-display text-[20px] font-semibold text-[#f1f1f6]">{money(safePeak.grossNgn)}</p>
					<p class="font-code text-[8px] text-[#c6bcff]">{shortDate(safePeak.day)} · {money(safePeak.payoutNgn)} disbursed</p>
					</div>
					<div class="text-right">
						<p class="mono-label !text-[7.5px]">Avg daily settlement</p>
						<p class="mt-1 font-display text-[20px] font-semibold text-[#f1f1f6]">{money(data.peaks.avgDaily)}</p>
						<p class="font-code text-[8px] text-emerald-300">{data.peaks.onTimePct}% on-time · batch SLA T+1 02:00</p>
					</div>
				</div>
				<div class="mt-3">
					<RevenueChart
						data={safeVelocity.map((day) => ({ day: day.day, value: day.grossNgn, secondary: day.payoutNgn }))}
						primaryLabel="Gross GMV"
						secondaryLabel="Payouts"
						height={210}
						secondaryColor="#8dd3c7"
					/>
				</div>
				<div class="mt-3 grid grid-cols-3 gap-2 border-t border-[#26262e] pt-2.5">
					<div><p class="mono-label !text-[7px]">Median cart</p><p class="mt-0.5 font-code text-[10px] text-[#dcdce4]">{money(29_600)}</p></div>
					<div><p class="mono-label !text-[7px]">Settlement velocity</p><p class="mt-0.5 font-code text-[10px] text-[#dcdce4]">T+0 paystack</p></div>
					<div><p class="mono-label !text-[7px]">Captured subaccounts</p><p class="mt-0.5 font-code text-[10px] text-[#dcdce4]">{settlements.totalSubaccounts}</p></div>
				</div>
			</div>
		</section>

		<section class="panel overflow-hidden">
			<header class="panel-head">
				<div>
					<h2 class="font-display text-[13px] font-semibold text-[#f0f0f5]">Verticals & gateway rails</h2>
					<p class="mt-0.5 text-[10px] text-[#6f6f7b]">Category yield distribution & Paystack payment methods.</p>
				</div>
				<span class="chip chip-ok !h-[17px] !text-[7.5px]">0.02% dispute</span>
			</header>
			<div class="p-4">
				<div class="flex items-center justify-between">
					<p class="mono-label !text-[8px]">Event category GMV share</p>
					<p class="font-code text-[8px] uppercase tracking-[0.06em] text-[#8f8f9b]">Total <span class="text-[#dcdce4]">{moneyCompact(settlements.grossNgn)}</span></p>
				</div>
				<div class="mt-2 flex h-2 overflow-hidden rounded-full bg-[#24242c]">
					<span style="width:54%" class="bg-[#c6bcff]"></span>
					<span style="width:28%" class="bg-[#8dd3c7]"></span>
					<span style="width:18%" class="bg-[#f2b880]"></span>
				</div>
				<div class="mt-2.5 space-y-1.5">
					{#each [{ label: 'Tech & AI conferences', value: 77_100_000, share: 54 }, { label: 'Afrobeats & live concerts', value: 40_000_000, share: 28 }, { label: 'Executive & founder summits', value: 25_750_000, share: 18 }] as vertical}
						<div class="flex items-center justify-between gap-2 text-[10px]">
							<span class="flex items-center gap-1.5 text-[#c9c9d4]"><span class="h-1.5 w-1.5 rounded-sm bg-[#6f6f7b]"></span>{vertical.label}</span>
							<span class="font-code text-[9.5px] text-[#e6e6ec]">{moneyCompact(vertical.value)} <span class="text-[#5d5d69]">({vertical.share}%)</span></span>
						</div>
					{/each}
				</div>

				<div class="mt-4">
					<p class="mono-label !text-[8px]">Ingress gateway rails</p>
					<div class="mt-1.5 grid grid-cols-3 gap-2">
						{#each gatewayRails as rail}
							<div class="panel-inset px-2 py-1.5">
								<p class="font-display text-[13px] font-semibold text-[#ececf1]">{rail.share}%</p>
								<p class="text-[8.5px] text-[#8f8f9b]">{rail.label}</p>
								<p class="font-code text-[7px] uppercase text-[#5d5d69]">{rail.detail}</p>
							</div>
						{/each}
					</div>
				</div>

				<div class="mt-3">
					<div class="flex items-center justify-between">
						<p class="mono-label !text-[8px]">Next batch clearance</p>
						<span class="font-code text-[8px] uppercase text-[#6f6f7b]">T+1 · 02:00 WAT</span>
					</div>
					<div class="mt-1.5 space-y-1">
						{#each cleared.slice(0, 3) as row (row.organizerId)}
							<a href={`/organizers?organizer=${row.organizerId}`} class="flex items-center gap-2 rounded-md border border-[#292930] px-2 py-1.5 hover:bg-[#1e1e25]">
								<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#34343d] bg-[#1e1e25] font-code text-[6.5px] text-[#a9a9b6]">{row.initials}</span>
								<span class="min-w-0 flex-1 truncate text-[9.5px] text-[#d4d4dc]">{row.name}</span>
								<span class="font-code text-[9px] text-[#e6e6ec]">{moneyCompact(row.payoutNgn)}</span>
							</a>
						{:else}
							<p class="text-[9.5px] text-[#6f6f7b]">No profiles cleared for the next batch.</p>
						{/each}
					</div>
				</div>

				<div class="mt-3 grid grid-cols-2 gap-2 border-t border-[#26262e] pt-2.5">
					<div class="flex items-center gap-1.5 text-[9px] text-[#8f8f9b]"><CalendarRange size={11} class="text-[#6f6f7b]" /> T+1 02:00 WAT auto-batch</div>
					<div class="flex items-center gap-1.5 text-[9px] text-[#8f8f9b]"><Landmark size={11} class="text-[#6f6f7b]" /> {settlements.totalSubaccounts} captured subaccounts</div>
				</div>
			</div>
		</section>
	</div>

	<section class="panel overflow-hidden">
		<header class="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262e] px-4 py-3">
			<div>
				<div class="flex items-center gap-2">
					<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Top earning organizers & settlement health</h2>
					<span class="chip !h-[17px] !text-[7.5px]">{settlements.totalProfiles} key entities</span>
				</div>
				<p class="mt-0.5 text-[10.5px] text-[#6f6f7b]">Real-time subaccount routing, pending escrow commitments, and payout clearance verification.</p>
			</div>
			<div class="flex items-center gap-2">
				<select class="select !h-[28px] !text-[10px]" value={status} onchange={setStatusFilter} aria-label="Filter settlement state">
					<option value="all">Filter: All statuses</option>
					<option value="settled">Settled · payout ready</option>
					<option value="next_batch">Next batch</option>
					<option value="queued">Queued</option>
					<option value="frozen">Escrow frozen</option>
				</select>
				<a class="btn btn-xs" href="/api/export/settlements" download><Download size={11} /> Download CSV</a>
			</div>
		</header>

		<div class="table-wrap">
			<table class="tbl">
				<thead>
					<tr>
						<th>Organizer entity</th>
						<th class="hidden xl:table-cell">Active events</th>
						<th>Tickets sold</th>
						<th>Gross GMV (NGN)</th>
						<th class="hidden 2xl:table-cell">Platform fees</th>
						<th>Net payout escrow</th>
						<th>Settlement status</th>
						<th>Action</th>
					</tr>
				</thead>
				<tbody>
					{#each visible as row (row.organizerId)}
						{@const meta = settlementState(row.state)}
						<tr>
							<td class="min-w-[190px]">
								<div class="flex items-center gap-2.5">
									<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#34343d] bg-[#1e1e25] font-code text-[9px] uppercase text-[#c9c9d4]">{row.initials}</span>
									<div class="min-w-0">
										<a href={`/organizers?organizer=${row.organizerId}`} class="flex items-center gap-1 truncate text-[11.5px] font-medium text-[#e8e8ee] hover:text-[#c6bcff]">
											{row.name}
											{#if row.state !== 'frozen'}<BadgeCheck size={10} class="text-emerald-400" />{/if}
										</a>
										<p class="font-code text-[8px] text-[#6f6f7b]">Paystack ···· {row.accountLast4}</p>
									</div>
								</div>
							</td>
							<td class="hidden whitespace-nowrap font-code text-[10px] text-[#dcdce4] xl:table-cell">{row.events} events</td>
							<td class="whitespace-nowrap font-code text-[10px] text-[#dcdce4]">{num(row.tickets)}</td>
							<td class="whitespace-nowrap font-code text-[10.5px] text-[#e6e6ec]">{money(row.gmvNgn)}</td>
							<td class="hidden whitespace-nowrap font-code text-[10px] text-[#8f8f9b] 2xl:table-cell">{money(row.feeNgn)}</td>
							<td class="whitespace-nowrap font-code text-[10.5px] text-[#dcdce4]">{money(row.payoutNgn)}</td>
							<td class="whitespace-nowrap">
								<span class={chipClass(meta.tone)}>{meta.label}</span>
								<p class="mt-0.5 max-w-[120px] truncate font-code text-[8px] text-[#6f6f7b]">{row.bank}</p>
							</td>
							<td>
								<a class="row-action" href={`/organizers?organizer=${row.organizerId}`} aria-label={`Open ${row.name} statement`}><ArrowDownToLine size={12} /></a>
							</td>
						</tr>
					{:else}
						<tr><td colspan="8" class="!py-6 text-center text-[11px] text-[#6f6f7b]">No settlement profiles match this filter.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-4 py-2.5">
			<p class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
				Showing {visible.length} of {rows.length} settlement profiles · {settlements.totalSubaccounts} captured subaccounts · cleared value {money(clearedValue)}
			</p>
			<div class="flex items-center gap-1.5">
				<button type="button" class="row-action" disabled={page === 1} onclick={() => (page = Math.max(1, page - 1))} aria-label="Previous page"><ChevronLeft size={12} /></button>
				{#each Array.from({ length: pages }, (_, index) => index + 1) as number}
					<button type="button" class="chip !h-[22px] !min-w-[22px] justify-center !px-1 !text-[9px] {page === number ? '!border-[#c6bcff]/45 !bg-[#c6bcff]/15 !text-[#dcd6ff]' : ''}" onclick={() => (page = number)}>{number}</button>
				{/each}
				<button type="button" class="row-action" disabled={page === pages} onclick={() => (page = Math.min(pages, page + 1))} aria-label="Next page"><ChevronRight size={12} /></button>
			</div>
		</div>
	</section>
</div>

<Sheet open={configOpen} title="Settlement configuration" subtitle="Paystack auto-batch policy for organizer subaccounts." onclose={() => (configOpen = false)} width="440px">
	<div class="space-y-3">
		<div class="grid grid-cols-2 gap-2">
			<div><p class="mono-label !text-[8px]">Take rate</p><p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">{settlements.commissionRate}%</p></div>
			<div><p class="mono-label !text-[8px]">Settlement window</p><p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">T+1 02:00</p></div>
		</div>
		<p class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-2.5 text-[9.5px] leading-relaxed text-[#8f8f9b]">
			Batch payouts settle direct to each organizer's Paystack subaccount. Changes require dual authorization and are appended to the audit ledger.
		</p>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (configOpen = false)}>Close</button>
			<a class="btn btn-sm btn-primary" href="/settings"><Gauge size={12} /> Open financial rails</a>
		</div>
	</div>
</Sheet>


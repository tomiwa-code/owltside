<script lang="ts">
	import {
		Activity,
		AlertTriangle,
		ArrowRight,
		CalendarDays,
		CheckCircle2,
		ChevronRight,
		Download,
		Gauge,
		MapPin,
		RefreshCw,
		ShieldCheck,
		Ticket,
		TrendingUp,
		Wallet,
		Zap
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, orderStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, pct, shortDate, time } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import KpiCard from '$components/KpiCard.svelte';
	import RevenueChart from '$components/RevenueChart.svelte';
	import Sparkline from '$components/Sparkline.svelte';

	let { data } = $props();
	const d = $derived(data.dashboard ?? {
		rangeLabel: 'Last 30 days', grossNgn: 0, netNgn: 0, grossDelta: 0, passes: 0, passesDelta: 0,
		liveEvents: 0, eventsToday: 0, pendingReview: 0, activePasses: 0, refundsPending: 0,
		moderationOpen: 0, series: [], tierMix: [], categoryMix: [], topEvents: [], reviewQueue: [],
		recentOrders: [], systemHealth: []
	});
	const safeSeries = $derived(d.series?.length ? d.series : [{ day: new Date().toISOString().slice(0, 10), grossNgn: 0, passes: 0 }]);
	const grossSeries = $derived(safeSeries.map((point) => point.grossNgn));
	const range = $derived(`${shortDate(safeSeries[0].day)} – ${shortDate(safeSeries[safeSeries.length - 1].day)}, ${new Date(safeSeries[safeSeries.length - 1].day).getFullYear()}`);
	const totalPasses = $derived(safeSeries.reduce((sum, point) => sum + point.passes, 0));
	const ledgerShare = $derived.by(() => (d.passes ? (d.activePasses / d.passes) * 100 : 0));
	const settledShare = $derived.by(() => (d.grossNgn ? (d.netNgn / d.grossNgn) * 100 : 0));
	const peakDay = $derived(safeSeries.reduce((peak, point) => point.grossNgn > peak.grossNgn ? point : peak, safeSeries[0]));

	let refreshing = $state(false);
	async function refresh() {
		refreshing = true;
		await invalidateAll();
		setTimeout(() => (refreshing = false), 450);
		toasts.ok('Telemetry refreshed', 'Live cluster metrics re-synced at ' + time(new Date().toISOString()));
	}

	function chipFor(tone: 'warn' | 'danger' | 'accent'): string {
		return chipClass(tone);
	}
</script>

<svelte:head><title>Dashboard · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Dashboard Overview"
		subtitle={data.source === 'supabase' ? 'Event, order and ticket metrics loaded from the configured Supabase project.' : 'Live metrics are unavailable until Supabase is configured; tiles below show zero placeholders.'}
		crumbs={['system']}
		eyebrow={data.source === 'supabase' ? 'Supabase · live data' : 'Unconfigured'}
	>
		{#snippet actions()}
			<span class="btn btn-sm btn-ghost pointer-events-none !text-[#9c9ca8]">
				<CalendarDays size={12} />
				{range}
			</span>
			<button type="button" class="btn btn-sm" onclick={refresh} disabled={refreshing}>
				<RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
				Refresh
			</button>
			<a class="btn btn-sm btn-primary" href="/api/export/dashboard">
				<Download size={12} />
				Export Executive Brief
			</a>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div class="panel border border-amber-400/30 bg-amber-400/[0.04] p-4 text-[11.5px] text-amber-100">
			<div class="flex items-start gap-2">
				<AlertTriangle size={14} class="mt-0.5 shrink-0 text-amber-300" />
				<div>
					<p class="font-display text-[13px] font-semibold">Live metrics unavailable</p>
					<p class="mt-0.5 text-[#d8cc8e]">{data.error}</p>
					<p class="mt-1 text-[10.5px] text-[#8f8f9b]">
						KPIs below are showing zero placeholders. Set
						<code class="rounded bg-black/40 px-1 py-0.5 text-[9.5px]">PUBLIC_SUPABASE_URL</code> and
						<code class="rounded bg-black/40 px-1 py-0.5 text-[9.5px]">SUPABASE_SERVICE_ROLE_KEY</code>
						in this admin app's environment (Vercel) to point at the public Owltside database, then reload.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- KPI row -->
	<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
		<div class="col-span-2 md:col-span-1">
			<KpiCard
				label="Gross volume"
				value={money(d.grossNgn)}
				delta={`${d.grossDelta}%`}
				sub="30d rolling · paid & pending orders"
				footnote="failed orders excluded"
			>
				<div class="flex items-end gap-1.5">
					<div class="h-[20px] min-w-0 flex-1">
						<Sparkline values={grossSeries.slice(-14)} height={20} />
					</div>
					<span class="shrink-0 font-code text-[8.5px] uppercase tracking-[0.08em] text-[#6f6f7b]">14d</span>
				</div>
			</KpiCard>
		</div>
		<KpiCard
			label="Paid orders"
			value={money(d.netNgn)}
			sub={`${pct(settledShare, 1)} of paid + pending volume`}
			progress={settledShare}
			progressTone="ok"
			footnote="orders.status = paid"
		/>
		<KpiCard
			label="Passes minted"
			value={num(d.passes)}
			sub="All ticket records"
			footnote="public.tickets · all-time"
		/>
		<KpiCard label="Live & active" value={String(d.liveEvents)} sub="Events active">
			<div class="grid grid-cols-2 gap-2 border-t border-[#292930] pt-2.5">
				<div>
					<p class="font-display text-[15px] font-semibold text-[#ececf1]">{d.eventsToday}</p>
					<p class="mono-label !text-[8px]">Live today</p>
				</div>
				<div>
					<p class="font-display text-[15px] font-semibold text-[#ececf1]">{d.pendingReview}</p>
					<p class="mono-label !text-[8px]">Pending</p>
				</div>
			</div>
		</KpiCard>
		<KpiCard
			label="Active passes"
			value={num(d.activePasses)}
			sub={`${pct(ledgerShare, 1)} of the ledger`}
			progress={ledgerShare}
			progressTone="accent"
			footnote="valid · not yet redeemed"
		/>
		<KpiCard
			label="Queue attention"
			value={String(d.pendingReview + d.refundsPending + d.moderationOpen)}
			sub={`${d.pendingReview} approvals · ${d.refundsPending} refunds · ${d.moderationOpen} reports`}
			footnote="SLA breach risk"
		>
			<div class="flex items-center gap-1.5">
				<span class="chip chip-danger !h-[17px] !text-[8px]">High urgency</span>
				<a href="/moderation" class="ml-auto inline-flex items-center gap-0.5 font-code text-[8.5px] uppercase tracking-[0.08em] text-[#c6bcff] hover:underline">
					Open <ArrowRight size={10} />
				</a>
			</div>
		</KpiCard>
	</div>

	<!-- Revenue + distribution -->
	<div class="grid grid-cols-1 gap-2.5 xl:grid-cols-[1.62fr_1fr]">
		<section class="panel overflow-hidden">
			<div class="panel-head">
				<div>
					<h2 class="font-display text-[15px] font-semibold text-[#f0f0f5]">Ticketing Revenue & Pass Minting</h2>
					<p class="mt-0.5 text-[11px] text-[#85858f]">
						Dual-rail telemetry: gross revenue (₦) against distributed digital passes.
					</p>
				</div>
				<div class="hidden items-center gap-1 sm:flex">
					<span class="chip !h-[22px]">30D rolling</span>
					<span class="chip chip-accent !h-[22px]">All tiers</span>
					<span class="chip !h-[22px]">VIP</span>
					<span class="chip !h-[22px]">General</span>
				</div>
			</div>
			<div class="px-3 pb-2 pt-4 sm:px-4">
				<RevenueChart
					data={d.series.map((point) => ({ day: point.day, value: point.grossNgn, secondary: point.passes }))}
					primaryLabel="Gross revenue (₦)"
					secondaryLabel="Passes minted"
					height={252}
				/>
				<div class="mt-2 grid grid-cols-3 gap-3 border-t border-[#26262e] px-1 pt-3">
					<div>
						<p class="mono-label !text-[8px]">Peak velocity day</p>
						<p class="mt-1 font-code text-[11.5px] text-[#dcdce4]">{moneyCompact(peakDay.grossNgn)} · {shortDate(peakDay.day)}</p>
					</div>
					<div>
						<p class="mono-label !text-[8px]">Passes · 30 days</p>
						<p class="mt-1 font-code text-[11.5px] text-[#dcdce4]">{num(totalPasses)}</p>
					</div>
					<div>
						<p class="mono-label !text-[8px]">Metric source</p>
						<p class="mt-1 font-code text-[11.5px] text-emerald-300">{data.source === 'supabase' ? 'Orders + tickets' : 'Demo snapshot'}</p>
					</div>
				</div>
			</div>
		</section>

		<section class="panel flex flex-col">
			<div class="panel-head">
				<div>
					<h2 class="font-display text-[15px] font-semibold text-[#f0f0f5]">Revenue Distribution</h2>
					<p class="mt-0.5 font-code text-[8.5px] uppercase tracking-[0.1em] text-[#6f6f7b]">By volume · last 30 days</p>
				</div>
				<span class="chip">By vertical</span>
			</div>
			<div class="flex-1 space-y-3 px-4 py-4">
				<div class="flex items-center justify-between font-code text-[8px] uppercase tracking-[0.12em] text-[#63636f]">
					<span>Event category</span>
					<span>GMV share</span>
				</div>
				{#each d.categoryMix as category, index}
					<div>
						<div class="mb-1.5 flex items-center gap-2">
							<span class="h-1.5 w-1.5 rounded-sm" style={`background:${['#c6bcff', '#8dd3c7', '#f2b880'][index]}`}></span>
							<span class="text-[11.5px] text-[#d4d4dc]">{category.category}</span>
							<span class="ml-auto font-code text-[10px] text-[#ececf1]">{moneyCompact(category.gmvNgn)}</span>
							<span class="w-8 text-right font-code text-[9px] text-[#7f7f8c]">{pct(category.share, 0)}</span>
						</div>
						<div class="meter !h-[3px]">
							<div
								class="meter-fill"
								style={`width:${Math.max(4, category.share)}%; background:${['#c6bcff', '#8dd3c7', '#f2b880'][index]}`}
							></div>
						</div>
					</div>
				{/each}

				<div class="border-t border-[#26262e] pt-3">
					<p class="mono-label !text-[7.5px]">Ticket tier mix</p>
					<div class="mt-1.5 space-y-1.5">
					{#each d.tierMix as tier}
						<div class="flex items-center gap-2 font-code text-[9px] text-[#8f8f9b]">
							<Ticket size={10} class="text-[#6f6f7b]" />
							<span class="truncate">{tier.tier}</span>
							<span class="ml-auto">{num(tier.count)}</span>
							<span class="w-10 text-right text-[#6f6f7b]">{pct(tier.share, 0)}</span>
						</div>
					{/each}
					</div>
				</div>
			</div>
			<div class="grid grid-cols-2 border-t border-[#26262e]">
				<div class="border-r border-[#26262e] px-4 py-3">
					<p class="mono-label !text-[7.5px]">High-yield vertical</p>
					<p class="mt-1 font-code text-[10px] text-emerald-300">Tech & AI (+32% MoM)</p>
				</div>
				<div class="px-4 py-3">
					<p class="mono-label !text-[7.5px]">Chargeback index</p>
					<p class="mt-1 font-code text-[10px] text-[#c9c9d4]">0.03% <span class="text-[#6f6f7b]">(low risk)</span></p>
				</div>
			</div>
		</section>
	</div>

	<!-- Queue + venues -->
	<div class="grid grid-cols-1 gap-2.5 xl:grid-cols-[1.62fr_1fr]">
		<section class="panel flex flex-col">
			<div class="panel-head">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="font-display text-[15px] font-semibold text-[#f0f0f5]">Urgent Review Queue</h2>
					<span class="chip chip-danger !text-[8px]">{d.pendingReview + d.moderationOpen + d.refundsPending} action items</span>
					<span class="chip !text-[8px]">{d.pendingReview} pending events</span>
					<span class="chip !text-[8px]">{d.refundsPending} refunds</span>
				</div>
				<a href="/moderation" class="font-code text-[8.5px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline">Moderation hub ↗</a>
			</div>
			<div class="divide-y divide-[#24242c]">
				{#each d.reviewQueue as item}
					<div class="flex items-center gap-3 px-4 py-3">
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#33333d] bg-[#1e1e25] text-[#c6bcff]">
							{#if item.tone === 'danger'}
								<AlertTriangle size={14} />
							{:else}
								<ShieldCheck size={14} />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="truncate text-[12px] font-medium text-[#e8e8ee]">{item.title}</p>
								<span class={chipFor(item.tone)}>{item.status}</span>
							</div>
							<p class="mt-0.5 truncate text-[10.5px] text-[#7f7f8c]">
								{item.ref} · Organized by {item.organizer}
							</p>
						</div>
						<div class="hidden shrink-0 items-center gap-2 sm:flex">
							<a href={item.id.startsWith('org') ? `/organizers/${item.id}` : `/events/${item.id}`} class="btn btn-sm btn-ghost">Inspect</a>
							<a href={item.id.startsWith('org') ? `/organizers/${item.id}` : `/events/${item.id}`} class="btn btn-sm {item.tone === 'danger' ? 'btn-danger-soft' : 'btn-primary'}">
								{item.tone === 'danger' ? 'Review' : 'Approve'}
							</a>
						</div>
						<a href={item.id.startsWith('org') ? `/organizers/${item.id}` : `/events/${item.id}`} class="row-action sm:hidden" aria-label="Inspect">
							<ChevronRight size={14} />
						</a>
					</div>
				{/each}
			</div>
			<div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-4 py-2.5 font-code text-[8.5px] uppercase tracking-[0.08em] text-[#6f6f7b]">
				<span>SLA guarantee: resolution within 240 mins</span>
				<a href="/moderation" class="text-[#c6bcff] hover:underline">Open moderation hub →</a>
			</div>
		</section>

		<section class="panel flex flex-col">
			<div class="panel-head">
				<div class="flex items-center gap-2">
					<span class="status-dot"></span>
					<h2 class="font-display text-[15px] font-semibold text-[#f0f0f5]">Top Performing Events</h2>
				</div>
				<span class="chip !text-[8px]">By tickets sold</span>
			</div>
			<div class="flex-1 space-y-2 px-3 py-3">
				{#each d.topEvents as item}
					<a href={`/events/${item.id}`} class="panel-inset block p-3 transition hover:border-[#3a3a46]">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="truncate text-[11.5px] font-medium text-[#e6e6ec]">{item.title}</p>
								<p class="mt-0.5 flex items-center gap-1 font-code text-[8.5px] uppercase tracking-[0.08em] text-[#6f6f7b]">
									<MapPin size={9} /> {item.venue}
								</p>
							</div>
							<span class="chip chip-ok !text-[8px]">{moneyCompact(item.grossNgn)}</span>
						</div>
						<div class="mt-2.5 flex items-center justify-between font-code text-[9px] text-[#9c9ca8]">
							<span>{num(item.sold)} / {num(item.capacity)}</span>
							<span>{pct(item.capacity ? (item.sold / item.capacity) * 100 : 0, 0)} sold</span>
						</div>
						<div class="meter mt-1.5">
							<div class="meter-fill meter-ok" style={`width:${item.capacity ? Math.min(100, (item.sold / item.capacity) * 100) : 0}%`}></div>
						</div>
					</a>
				{:else}
					<p class="px-1 py-6 text-center text-[10.5px] text-[#8f8f9b]">No published events yet.</p>
				{/each}
			</div>
			<div class="flex items-center justify-between border-t border-[#26262e] px-4 py-2.5 font-code text-[8.5px] uppercase tracking-[0.08em] text-[#6f6f7b]">
				<span class="inline-flex items-center gap-1.5"><span class="status-dot !h-1 !w-1"></span>Ledger synced</span>
				<a href="/events" class="hover:text-[#c6bcff]">All events</a>
			</div>
		</section>
	</div>

	<section class="panel overflow-hidden">
		<div class="panel-head">
			<div>
				<h2 class="font-display text-[15px] font-semibold text-[#f0f0f5]">Recent Financial Transactions</h2>
				<p class="mt-0.5 text-[11px] text-[#85858f]">Real-time payment settlements, encrypted tickets dispatched to pass wallets.</p>
			</div>
			<a href="/orders" class="font-code text-[8.5px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline">View all orders →</a>
		</div>
		<div class="table-wrap">
			<table class="tbl">
				<thead>
					<tr>
						<th>Order ID</th>
						<th>Customer</th>
						<th>Target event</th>
						<th class="hidden xl:table-cell">Pass tier</th>
						<th class="!text-right">Amount (NGN)</th>
						<th class="hidden xl:table-cell">Rail</th>
						<th class="hidden md:table-cell">Timestamp</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each d.recentOrders as order}
						{@const meta = orderStatus(order.status)}
						<tr>
							<td><a class="font-code text-[10.5px] text-[#c6bcff] hover:underline" href="/orders?q={order.reference}">{order.reference}</a></td>
							<td>
								<p class="primary-cell text-[11.5px]">{order.customerName}</p>
								<p class="font-code text-[9px] text-[#6f6f7b]">{order.customerEmail}</p>
							</td>
							<td class="max-w-[170px] truncate">{order.eventTitle}</td>
							<td class="hidden xl:table-cell">{order.tierLabel}</td>
							<td class="num">{money(order.totalNgn)}</td>
							<td class="hidden text-[10.5px] xl:table-cell">{order.method}</td>
							<td class="hidden whitespace-nowrap font-code text-[9.5px] md:table-cell">{time(order.createdAt)}</td>
							<td><span class={chipClass(meta.tone)}>{meta.label}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="flex items-center justify-between border-t border-[#26262e] px-4 py-2.5 font-code text-[8.5px] uppercase tracking-[0.08em] text-[#6f6f7b]">
			<span>Live feed · {num(d.recentOrders.length)} most recent settled</span>
			<span class="inline-flex items-center gap-2"><Activity size={10} /> Poll 5s</span>
		</div>
	</section>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		{#each d.systemHealth as item}
			<div class="panel flex items-center gap-3 px-4 py-3">
				{#if item.key === 'ledger'}
					<Zap size={15} class="text-[#c6bcff]" />
				{:else if item.key === 'paystack'}
					<Wallet size={15} class="text-emerald-300" />
				{:else if item.key === 'webhooks'}
					<ShieldCheck size={15} class="text-[#8dd3c7]" />
				{:else}
					<TrendingUp size={15} class="text-[#f2b880]" />
				{/if}
				<div class="min-w-0">
					<p class="mono-label !text-[7.5px]">{item.label}</p>
					<p class="truncate font-code text-[10px] text-[#c9c9d4]">{item.value}</p>
				</div>
				{#if item.ok}
					<span class="ml-auto status-dot !h-1 !w-1"></span>
				{/if}
			</div>
		{/each}
	</div>
</div>

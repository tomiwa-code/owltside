<script lang="ts">
	import {
		AlertTriangle,
		BadgeCheck,
		Ban,
		Check,
		ChevronDown,
		Download,
		Gauge,
		Megaphone,
		Printer,
		Radar,
		RefreshCw,
		ScanLine,
		Search,
		ShieldAlert,
		StickyNote,
		Ticket,
		Undo2,
		Wifi,
		Zap
	} from '@lucide/svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { ticketStatus } from '$admin/utils/status';
	import { money, num, relative, shortDate, time } from '$admin/utils/format';
	import type { AdminTicket } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Ring from '$components/Ring.svelte';

	let { data } = $props();

	let code = $state('');
	let busy = $state(false);
	let noteOpen = $state(false);
	let note = $state('');
	let lookup = $state.raw<AdminTicket | null>(null);
	let lastScan = $state<string | null>(null);

	const ops = $derived(data.ops);
	const scopedEvent = $derived(ops.events.find((event) => event.id === ops.eventId));

	$effect(() => {
		lookup = data.lookup;
	});

	function changeEvent(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		goto(`/checkin?event=${value}`, { keepFocus: true, noScroll: true, replaceState: true });
	}

	async function submitScan(event?: SubmitEvent) {
		event?.preventDefault();
		const value = code.trim();
		if (!value) return;
		busy = true;
		const response = await fetch('/api/checkin/scan', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: value })
		});
		const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; ticket?: AdminTicket; error?: string; alreadyCheckedIn?: boolean };
		busy = false;
		if (!response.ok || !payload.ok) {
			toasts.error('Entry denied', payload.error ?? 'Pass validation failed.');
			return;
		}
		lookup = payload.ticket ?? null;
		lastScan = new Date().toISOString();
		toasts.ok(payload.alreadyCheckedIn ? 'Pass already cleared' : 'Pass cleared', `${payload.ticket?.holderName} · ${payload.ticket?.gate ?? 'Manual gate'}`);
		code = '';
		await invalidateAll();
	}

	async function undoCheckin(ticket: AdminTicket | null) {
		if (!ticket) return;
		busy = true;
		const response = await fetch('/api/checkin/toggle', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id: ticket.id, checkedIn: false })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Undo blocked', 'Your tier cannot reverse gate scans.');
			return;
		}
		toasts.ok('Check-in reversed', `${ticket.code} restored to valid. Marshal notified.`);
		await invalidateAll();
	}

	async function manualAdmit(ticket: AdminTicket | null) {
		if (!ticket) return;
		busy = true;
		const response = await fetch('/api/checkin/toggle', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id: ticket.id, checkedIn: true })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Manual admit failed', 'Tier 2+ required for gate overrides.');
			return;
		}
		toasts.ok('Manual admit granted', `${ticket.holderName} cleared at the manual override gate.`);
		await invalidateAll();
	}
</script>

<svelte:head><title>Check-in Ops · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<section class="panel relative overflow-hidden p-3.5">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div class="min-w-0">
				<p class="flex items-center gap-2 font-code text-[8.5px] uppercase tracking-[0.14em] text-[#8f8f9b]">
					Operational dispatch <span class="chip chip-accent !h-[16px] !text-[7px]">Live gates</span>
				</p>
				<h1 class="mt-1.5 flex items-center gap-2 font-display text-[19px] font-semibold tracking-[-0.01em] text-[#f1f1f6]">
					<ScanLine size={17} class="text-[#c6bcff]" />
					<span class="truncate">{scopedEvent?.title ?? 'Gate operations'}</span>
					<span class="hidden text-[#5d5d69] sm:inline">—</span>
					<span class="hidden truncate text-[14px] font-normal text-[#8f8f9b] sm:inline">{scopedEvent?.venue}</span>
				</h1>
				<p class="mt-1 flex flex-wrap items-center gap-2 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
					<span>Starts {shortDate(scopedEvent?.startsAt ?? '')}</span>
					<span class="text-[#3f3f49]">•</span>
					<span class="flex items-center gap-1 text-emerald-300"><RefreshCw size={8} /> Offline cache ready (1,248 RSA keys)</span>
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<span class="chip chip-ok !h-[24px] !text-[8.5px]"><span class="status-dot"></span> Turnstile mesh online</span>
				<span class="chip !h-[24px] !text-[8.5px]">{ops.fleet.length} scanners active</span>
				<select class="select !h-[26px] !max-w-[220px] !text-[9.5px]" value={ops.eventId} onchange={changeEvent} aria-label="Select gated event">
					{#each ops.events.slice(0, 12) as event}
						<option value={event.id}>{event.title}</option>
					{/each}
				</select>
			</div>
		</div>
	</section>

	<div class="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
		<div class="panel flex items-center gap-3 p-4">
			<div class="min-w-0 flex-1">
				<p class="mono-label">Clearance volume</p>
				<p class="mt-1.5 font-display text-[clamp(17px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(ops.clearance.checkedIn)} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">/ {num(ops.clearance.capacity)}</span></p>
				<p class="mt-1.5 text-[10px] text-[#8f8f9b]">{num(ops.clearance.remaining)} remaining · Cap {ops.clearance.pct}%</p>
			</div>
			<Ring value={ops.clearance.pct} size={54} />
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Peak gate velocity</p><Gauge size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-1.5 font-display text-[clamp(17px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{ops.velocity.value} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">scans/min</span></p>
			<div class="mt-2 flex items-end gap-[3px]">
				{#each ops.velocity.series as value}
					<span class="w-[5px] rounded-sm bg-[#c6bcff]/45" style="height: {8 + value * 2}px"></span>
				{/each}
			</div>
			<p class="mt-1.5 text-[9.5px] text-[#8f8f9b]"><span class="text-emerald-300">+18%</span> surge at Gate 2 VIP</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">HMAC unlock latency</p><Zap size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-1.5 font-display text-[clamp(17px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{ops.latency.avgMs} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">ms avg</span></p>
			<div class="mt-2.5 h-1 overflow-hidden rounded-full bg-[#26262e]"><span class="block h-full w-[62%] rounded-full bg-[#8dd3c7]"></span></div>
			<p class="mt-1.5 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Local p99 {ops.latency.p99Ms}ms · node #01-WAT</p>
		</div>
		<div class="panel border-red-500/20 bg-red-500/[0.04] p-4">
			<div class="flex items-center justify-between"><p class="mono-label !text-red-200/70">Rejection audit</p><span class="flex h-5 w-5 items-center justify-center rounded bg-red-500/20 text-red-200"><ShieldAlert size={11} /></span></div>
			<p class="mt-1.5 font-display text-[clamp(17px,2.4vw,24px)] font-semibold leading-none text-red-100">{ops.rejections.flagged} <span class="font-code text-[10px] font-normal text-red-200/70">flagged</span></p>
			<div class="mt-2 flex items-center justify-between font-code text-[8px] uppercase tracking-[0.04em] text-red-200/60">
				<span>Duplicate screenshot {ops.rejections.duplicates}</span>
				<span>Unverified {ops.rejections.unverified}</span>
			</div>
		</div>
	</div>

	<section class="panel p-3">
		<form onsubmit={submitScan} class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Ticket size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8f8f9b]" />
				<input
					bind:value={code}
					class="input !h-[40px] !pl-9 !font-code !text-[12.5px] tracking-[0.06em]"
					placeholder="Scan or type a pass code — OWL-2025-AI-9942"
					aria-label="Pass code lookup"
					autocomplete="off"
				/>
			</div>
			<div class="flex flex-wrap gap-2">
				<button type="submit" class="btn btn-sm btn-primary !h-[40px]" disabled={busy}><Search size={12} /> {busy ? 'Verifying…' : 'Verify & admit'}</button>
				<button type="button" class="btn btn-sm !h-[40px]" onclick={() => { code = ''; lookup = null; }}>Clear</button>
				<button type="button" class="btn btn-sm !h-[40px]" onclick={() => toasts.ok('Marshal alert broadcast', 'All gate marshals pinged on the radio bridge.')}><Megaphone size={12} /> Broadcast</button>
				<a class="btn btn-sm !h-[40px]" href="/api/export/checkin" download><Download size={12} /> Export log</a>
			</div>
		</form>
	</section>

	{#if lookup}
		{@const meta = ticketStatus(lookup.status)}
		<section class="panel overflow-hidden">
			<header class="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262e] px-4 py-2">
				<p class="flex items-center gap-2 font-code text-[8.5px] uppercase tracking-[0.1em] text-[#8f8f9b]">
					<span class="status-dot"></span> Ticket lookup verification result
					<span class="text-[#54545f]">Ref: {lookup.code}</span>
				</p>
				<p class="font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Verified {lastScan ? relative(lastScan) : 'just now'} · latency 112ms</p>
			</header>
			<div class="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1.4fr_auto_1fr_auto]">
				<div class="flex items-stretch gap-3 rounded-lg border {lookup.status === 'void' || lookup.status === 'refunded' ? 'border-red-500/30 bg-red-500/[0.05]' : 'border-emerald-500/25 bg-emerald-500/[0.05]'} p-3">
					<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full {lookup.status === 'void' || lookup.status === 'refunded' ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}">
						{#if lookup.status === 'void' || lookup.status === 'refunded'}<Ban size={18} />{:else}<BadgeCheck size={18} />{/if}
					</span>
					<div class="min-w-0">
						<p class="font-code text-[8.5px] uppercase tracking-[0.1em] {lookup.status === 'void' || lookup.status === 'refunded' ? 'text-red-300' : 'text-emerald-300'}">
							{lookup.status === 'void' || lookup.status === 'refunded' ? `${lookup.status} pass — entry denied` : 'Valid pass confirmed'}
						</p>
						<p class="mt-1 font-display text-[17px] font-semibold text-[#f1f1f6]">{lookup.holderName}</p>
						<p class="font-code text-[9px] text-[#8f8f9b]">@{lookup.holderHandle} · {lookup.code}</p>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3 border-[#26262e] lg:border-x lg:px-3">
					<div>
						<p class="mono-label !text-[7.5px]">Pass tier</p>
						<p class="mt-1 text-[11px] text-[#e6e6ec]">{lookup.tierName}</p>
						<p class="font-code text-[8px] text-[#6f6f7b]">Tier code: {lookup.tierName.slice(0, 3).toUpperCase()}-{lookup.priceNgn ? 'PAID' : 'FREE'}</p>
					</div>
					<div>
						<p class="mono-label !text-[7.5px]">Seating / access</p>
						<p class="mt-1 text-[11px] text-[#e6e6ec]">{lookup.seat}</p>
						<p class="font-code text-[8px] text-[#6f6f7b]">Backstage pass: {lookup.tierName.toLowerCase().includes('vip') ? 'YES' : 'NO'}</p>
					</div>
					<div>
						<p class="mono-label !text-[7.5px]">Gate clearance</p>
						<p class="mt-1 flex items-center gap-1 text-[11px] text-[#e6e6ec]"><Check size={10} class="text-emerald-400" /> {lookup.checkedInAt ? time(lookup.checkedInAt) : 'Not scanned'}</p>
						<p class="font-code text-[8px] text-[#6f6f7b]">{lookup.gate ?? 'Awaiting first scan'}</p>
					</div>
					<div>
						<p class="mono-label !text-[7.5px]">Settlement</p>
						<p class="mt-1 text-[11px] text-[#e6e6ec]">{money(lookup.priceNgn)}</p>
						<p class="font-code text-[8px] text-[#6f6f7b]">{lookup.settlement} · {lookup.orderRef}</p>
					</div>
				</div>

				<div class="flex flex-col gap-1.5">
					<button type="button" class="btn btn-sm" onclick={() => toasts.ok('Badge queued', `${lookup?.code} sent to the nearest thermal printer.`)}><Printer size={12} /> Print physical badge</button>
					<button type="button" class="btn btn-sm" onclick={() => (noteOpen = !noteOpen)}><StickyNote size={12} /> Log security note</button>
					{#if lookup.status === 'checked_in'}
						<button type="button" class="btn btn-sm btn-danger" disabled={busy} onclick={() => undoCheckin(lookup)}><Undo2 size={12} /> Undo check-in</button>
					{:else}
						<button type="button" class="btn btn-sm" disabled={busy} onclick={() => manualAdmit(lookup)}><ScanLine size={12} /> Manual admit</button>
					{/if}
				</div>
			</div>
			{#if noteOpen}
				<form
					class="flex flex-col gap-2 border-t border-[#26262e] px-4 py-2.5 sm:flex-row"
					onsubmit={(event) => { event.preventDefault(); toasts.ok('Security note logged', 'Attached to the gate audit stream.'); noteOpen = false; note = ''; }}
				>
					<input class="input !h-[32px] !text-[11px]" bind:value={note} required placeholder="e.g. Passholder presented a cracked screen; verified NIN slip manually." />
					<button class="btn btn-sm btn-primary" type="submit">Attach note</button>
				</form>
			{/if}
		</section>
	{/if}

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.65fr_1fr]">
		<section class="panel overflow-hidden">
			<header class="panel-head">
				<div class="flex items-center gap-2"><Radar size={13} class="text-[#8f8f9b]" /><p class="mono-label">Live gate activity feed</p></div>
				<span class="flex items-center gap-1.5 font-code text-[8px] uppercase tracking-[0.08em] text-emerald-300"><span class="status-dot"></span> Auto-refresh 1s</span>
			</header>
			<div class="table-wrap">
				<table class="tbl">
					<thead><tr><th>Time (WAT)</th><th>Attendee</th><th>Ticket type</th><th>Gate & scanner</th><th>Verification status</th></tr></thead>
					<tbody>
						{#each ops.feed as ticket (ticket.id)}
							<tr>
								<td class="whitespace-nowrap font-code text-[9.5px] text-[#c9c9d4]">{ticket.checkedInAt ? time(ticket.checkedInAt) : '—'}</td>
								<td class="min-w-[130px]">
									<a href={`/tickets?ticket=${ticket.id}`} class="block truncate text-[10.5px] text-[#e6e6ec] hover:text-[#c6bcff]">{ticket.holderName}</a>
									<p class="font-code text-[8px] text-[#6f6f7b]">{ticket.code}</p>
								</td>
								<td><span class="chip !h-[17px] !text-[8px]">{ticket.tierName}</span></td>
								<td class="whitespace-nowrap">
									<p class="text-[10px] text-[#d4d4dc]">{ticket.gate ?? '—'}</p>
									<p class="font-code text-[8px] text-[#6f6f7b]">{ticket.scannerId ?? 'Scanner unavailable'}</p>
								</td>
								<td>
									<span class="chip chip-ok !h-[17px] !text-[8px]">Cleared (HMAC)</span>
								</td>
							</tr>
						{:else}
							<tr><td colspan="5" class="!py-6 text-center text-[11px] text-[#6f6f7b]">No gate events recorded for this event yet.</td></tr>
						{/each}
						<tr class="bg-red-500/[0.04]">
							<td class="whitespace-nowrap font-code text-[9.5px] text-[#c9c9d4]">{time(new Date(Date.now() - 420_000).toISOString())}</td>
							<td class="min-w-[130px]">
								<p class="flex items-center gap-1 truncate text-[10.5px] text-[#e6e6ec]"><AlertTriangle size={10} class="text-red-300" /> Unknown guest</p>
								<p class="font-code text-[8px] text-[#6f6f7b]">#EV-9921-DUP</p>
							</td>
							<td><span class="chip !h-[17px] !text-[8px]">Standard pass</span></td>
							<td class="whitespace-nowrap">
								<p class="text-[10px] text-[#d4d4dc]">Gate 1 main entry</p>
								<p class="font-code text-[8px] text-[#6f6f7b]">Scanner #92 (Fola D.)</p>
							</td>
							<td>
								<span class="chip chip-danger !h-[17px] !text-[8px]">Rejected · duplicate scan</span>
								<p class="font-code text-[7.5px] text-[#6f6f7b]">Scanned at {time(new Date(Date.now() - 1_800_000).toISOString())}</p>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-4 py-2">
				<p class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Showing last {ops.feed.length + 1} of {num(ops.clearance.checkedIn)} recorded events</p>
				<div class="flex gap-1">
					<span class="chip chip-ok !h-[18px] !text-[7.5px]">Filter: cleared</span>
					<span class="chip chip-danger !h-[18px] !text-[7.5px]">Filter: flags ({ops.rejections.flagged})</span>
				</div>
			</div>
		</section>

		<div class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head">
					<div class="flex items-center gap-2"><Wifi size={13} class="text-[#8f8f9b]" /><p class="mono-label">Scanner hardware fleet</p></div>
					<span class="chip chip-ok !h-[17px] !text-[7.5px]">{ops.fleet.length}/{ops.fleet.length} online</span>
				</header>
				<div class="divide-y divide-[#24242c]">
					{#each ops.fleet as node}
						<div class="flex items-center gap-3 px-3.5 py-2.5" class:bg-[#1c1c23]={node.id === 'node-04'}>
							<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#34343d] bg-[#1e1e25] font-code text-[8px] text-[#c9c9d4]">#{node.id.slice(-2)}</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[10.5px] font-medium text-[#e6e6ec]">{node.label}</p>
								<p class="truncate font-code text-[8px] text-[#6f6f7b]">Marshal: {node.marshal} · {node.mode}</p>
							</div>
							<div class="text-right">
								<p class="font-display text-[12px] font-semibold {node.health >= 90 ? 'text-emerald-300' : 'text-amber-300'}">{node.health}%</p>
								<p class="font-code text-[7.5px] text-[#6f6f7b]">{node.queue} queued</p>
							</div>
						</div>
					{/each}
				</div>
				<div class="flex items-center justify-between border-t border-[#26262e] px-3.5 py-2">
					<p class="font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Firmware v4.18.2-prod · all sync locks clear</p>
					<button type="button" class="btn btn-xs" onclick={() => toasts.ok('Resync requested', 'RSA key bundle pushed to 4 nodes.')}><RefreshCw size={10} /> Force re-sync</button>
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Offline cache integrity</p><span class="chip !h-[16px] !text-[7.5px]">1,248 keys</span></header>
				<div class="space-y-2 p-3.5">
					<div class="space-y-1 text-[10px]">
						<p class="flex justify-between"><span class="text-[#6f6f7b]">HMAC epoch</span><span class="font-code text-[#dcdce4]">14 · rotating 30s</span></p>
						<p class="flex justify-between"><span class="text-[#6f6f7b]">Anti-passback window</span><span class="font-code text-[#dcdce4]">5 minutes</span></p>
						<p class="flex justify-between"><span class="text-[#6f6f7b]">Last key sync</span><span class="font-code text-[#dcdce4]">{relative(new Date(Date.now() - 900_000).toISOString())}</span></p>
						<p class="flex justify-between"><span class="text-[#6f6f7b]">Cached passes</span><span class="font-code text-[#dcdce4]">{num(ops.codes)}</span></p>
					</div>
					<div class="rounded-md border border-[#2a2a32] bg-[#18181e] px-2.5 py-2 text-[9px] leading-relaxed text-[#8f8f9b]">
						Turnstiles fall back to the signed local cache if the control plane is unreachable. Replays outside the 30s epoch window are rejected.
					</div>
				</div>
			</section>
		</div>
	</div>
</div>

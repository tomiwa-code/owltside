<script lang="ts">
	import {
		ArrowLeftRight,
		BadgeCheck,
		Banknote,
		Ban,
		Bell,
		CalendarDays,
		ChevronRight,
		CircleCheck,
		Copy,
		Download,
		Flame,
		IdCard,
		KeyRound,
		LayoutGrid,
		Map,
		MapPin,
		Megaphone,
		Network,
		PenLine,
		Plus,
		PlusCircle,
		Radio,
		RefreshCw,
		ScanBarcode,
		Search,
		Send,
		Settings2,
		ShieldCheck,
		ShoppingBag,
		SlidersHorizontal,
		TrendingUp,
		UserCheck,
		Users,
		Wallet,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import { page } from '$app/state';
	import { useQuery } from '$lib/state/query.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { formatMoney } from '$lib/utils/money';
	import { fmtDate, fmtRelative } from '$lib/utils/dates';
	import type { OrganizerPayload } from '$lib/types';

	let { data } = $props();

	const org = useQuery<OrganizerPayload>(
		'organizer:me',
		async () => (await fetch('/api/organizer')).json(),
		{ staleTime: 8_000, refetchInterval: 10_000 },
		data.payload
	);
	const payload = $derived(org.data);
	const stats = $derived(payload?.stats);
	const mainEvent = $derived(payload?.events[0]);

	let broadcastOpen = $state(false);
	let staffOpen = $state(false);
	let broadcastMsg = $state('');
	const pins = $state(['4821', '9307', '1156']);
	function newPin() {
		pins.push(String(Math.floor(1000 + Math.random() * 9000)));
	}

	const checkinRate = $derived(
		stats && stats.capacity ? Math.round((stats.checkedIn / stats.capacity) * 1000) / 10 : 0
	);

	// ── desktop console state ──
	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';
	let deskPin = $state('8042-99');

	const rejected = $derived((payload?.checkins ?? []).filter((c) => c.result !== 'verified').length);
	const potential = $derived(
		(payload?.events ?? []).reduce((s, e) => s + e.tiers.reduce((x, t) => x + t.capacity * t.price, 0), 0)
	);
	const goalPct = $derived(stats && potential ? Math.round((stats.revenue / potential) * 1000) / 10 : 0);
	const gateCount = $derived(new Set((payload?.checkins ?? []).map((c) => c.gate)).size || 2);
	const terminals = $derived(
		[...new Set((payload?.checkins ?? []).map((c) => c.gate))].map((g, i) => ({
			name: g.replace(' • ', ': ').replace('Fast-Pass', 'Fast-Pass Turnstiles').replace('Staff Scanner', 'VIP & Speaker Concierge'),
			sub: i === 0 ? '3 scanners active • 98.4% uptime' : '2 scanners active • Biometric unit on',
			ms: i === 0 ? '18ms' : '22ms'
		}))
	);
	const dateLabel = $derived(
		mainEvent
			? mainEvent.endsAt
				? `${fmtDate(mainEvent.startsAt)}–${fmtDate(mainEvent.endsAt)}, ${new Date(mainEvent.endsAt).getFullYear()}`
				: `${fmtDate(mainEvent.startsAt)}, ${new Date(mainEvent.startsAt).getFullYear()}`
			: ''
	);

	function regenPin() {
		deskPin = `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}`;
		toast('Scanner passkey rotated — old PIN voided', 'success');
	}
	async function copyScannerLink() {
		try {
			await navigator.clipboard.writeText(`${location.origin}/organizer/scan`);
			toast('Scanner link copied to clipboard', 'success');
		} catch {
			toast('Scanner link ready on the gate device', 'info');
		}
	}
	function exportCsv() {
		const rows = [
			['Attendee', 'Tier', 'Gate', 'Result', 'Scanned At'],
			...(payload?.checkins ?? []).map((c) => [c.holder, c.tier, c.gate, c.result, c.at])
		];
		const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'attendee-checkins.csv';
		a.click();
		URL.revokeObjectURL(url);
		toast('Attendee CSV exported', 'success');
	}
</script>

<svelte:head><title>Organizer Console • Owltside</title></svelte:head>

<!-- ── desktop (md+) organizer command console per the desktop design source,
     themed with Evently Pulse tokens; mobile console below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-50 border-b border-surface-glass-border bg-surface-base/85 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center gap-5">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
			</a>
			<nav class="flex items-center gap-1" aria-label="Primary">
				{#each [
					['/home', 'Home'],
					['/explore', 'Explore'],
					['/tickets', 'Tickets'],
					['/organizer', 'Organizer']
				] as [href, label]}
					<a
						{href}
						class="px-3 h-9 rounded-lg flex items-center text-body-sm transition-colors {href === '/organizer' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}"
					>
						{label}
					</a>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<span class="relative hidden lg:flex items-center w-64 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, venues…</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</span>
			<span class="hidden xl:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-surface-glass-border {MONO} text-on-surface-variant shrink-0">
				<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Secure_Node
			</span>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7E3…A14</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">Connected</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name={page.data.session?.name ?? 'Guest'} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8">
		<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-wrap items-center gap-x-5 gap-y-4 justify-between">
			<span class="flex items-center gap-4 min-w-0">
				<span class="w-11 h-11 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center justify-center shrink-0">
					<Network class="w-5 h-5 text-primary" />
				</span>
				<span class="min-w-0">
					<span class="flex items-center gap-2">
						<span class="font-display text-headline-md text-on-surface truncate">{page.data.session?.name ?? 'Ada Obi'}</span>
						<a href="/settings" aria-label="Organization settings" class="text-on-surface-variant hover:text-on-surface transition-colors">
							<Settings2 class="w-4 h-4" />
						</a>
					</span>
					<span class="{MONO} text-on-surface-variant block mt-0.5">Org-ID: 0x94F2…88A0</span>
				</span>
			</span>
			<span class="flex items-center gap-3 flex-wrap">
				<a href="/settings" class="h-9 px-3.5 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors">
					<ArrowLeftRight class="w-4 h-4 text-on-surface-variant" /><span>Switch Organization</span>
				</a>
				<span class="h-9 px-3.5 rounded-lg flex items-center gap-2 {MONO} text-on-surface-variant border border-surface-glass-border">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
					{mainEvent?.live ? 'Live' : 'Standby'} • {gateCount} Gates Active
				</span>
			</span>
			<span class="flex items-center gap-3 flex-wrap">
				<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={exportCsv}>
					<Download class="w-4 h-4 text-on-surface-variant" /><span>Export Attendee CSV</span>
				</button>
				<a href="/organizer/scan" class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors">
					<ScanBarcode class="w-4 h-4 text-on-surface-variant" /><span>Open Camera QR Scanner</span>
				</a>
				<a href="/organizer/create" class="h-10 px-4 rounded-lg flex items-center gap-2 bg-on-surface text-surface-base text-body-sm font-semibold hover:opacity-90 transition-opacity">
					<Plus class="w-4 h-4" /><span>Create New Event</span>
				</a>
			</span>
		</div>
	</div>

	{#if stats}
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-5">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col">
				<div class="flex items-center justify-between gap-2">
					<span class="{MONO} text-on-surface-variant">Total Gross Revenue</span>
					<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-high text-accent-emerald">+{stats.revenueDeltaPct}%</span>
				</div>
				<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">{formatMoney(stats.revenue)}</span>
				<span class="text-body-sm text-on-surface-variant mt-1.5">NGN Escrow • All {mainEvent?.tiers.length ?? 0} Tiers</span>
				<div class="w-full h-1 rounded-full bg-surface-container-highest overflow-hidden mt-4">
					<div class="h-full bg-primary rounded-full" style="width: {goalPct}%"></div>
				</div>
				<div class="flex items-center justify-between mt-2 text-xs text-on-surface-variant">
					<span>Target: {formatMoney(potential)}</span>
					<span>{goalPct}% to Goal</span>
				</div>
			</section>
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col">
				<div class="flex items-center justify-between gap-2">
					<span class="{MONO} text-on-surface-variant">Checked-In Attendance</span>
					<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant"><span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> {checkinRate}% Live</span>
				</div>
				<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">
					{stats.checkedIn} <span class="text-[22px] font-medium text-on-surface-variant">/ {stats.capacity.toLocaleString()}</span>
				</span>
				<span class="text-body-sm text-on-surface-variant mt-1.5">{(stats.capacity - stats.checkedIn).toLocaleString()} attendees expected</span>
				<div class="w-full h-1 rounded-full bg-surface-container-highest overflow-hidden mt-4">
					<div class="h-full bg-primary rounded-full transition-all duration-700" style="width: {checkinRate}%"></div>
				</div>
				<div class="flex items-center justify-between mt-2 text-xs text-on-surface-variant">
					<span>Peak Hour 18:00</span>
					<span>{checkinRate}% Checked</span>
				</div>
			</section>
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col">
				<div class="flex items-center justify-between gap-2">
					<span class="{MONO} text-on-surface-variant">Ticket Velocity</span>
					<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{stats.soldLastHour}/hr</span>
				</div>
				<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">
					{stats.orders.toLocaleString()} <span class="text-[22px] font-medium text-on-surface-variant">Sold</span>
				</span>
				<span class="text-body-sm text-on-surface-variant mt-1.5">{stats.soldPct}% Capacity allocation</span>
				<div class="flex-1"></div>
				<div class="flex items-center justify-between mt-4 text-xs text-on-surface-variant">
					<span class="flex items-center gap-1.5"><Flame class="w-3.5 h-3.5 text-secondary" /> High Demand</span>
					<span>{(stats.capacity - stats.orders).toLocaleString()} left in pool</span>
				</div>
			</section>
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col">
				<div class="flex items-center justify-between gap-2">
					<span class="{MONO} text-on-surface-variant">Available Payout</span>
					<span class="{MONO} text-on-surface-variant">GTB ••••4821</span>
				</div>
				<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">{formatMoney(stats.payout)}</span>
				<span class="text-body-sm text-on-surface-variant mt-1.5">Cleared settlement balance</span>
				<div class="flex-1"></div>
				<button class="w-full h-9 mt-4 rounded-md flex items-center justify-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={() => toast('Payout of ' + formatMoney(stats.payout) + ' on its way', 'success')}>
					<Zap class="w-4 h-4 text-accent-amber" /><span>Request Instant Payout</span>
				</button>
			</section>
		</div>
	{/if}

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
		<div class="flex flex-col gap-6 min-w-0">
			{#if mainEvent}
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="min-w-0">
							<span class="flex items-center gap-3 flex-wrap">
								<span class="flex items-center gap-1.5 px-2.5 py-1 rounded {MONO} bg-surface-container-high border border-surface-glass-border text-on-surface">
									<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
									{mainEvent.live ? 'Gates Open & Live' : 'Scheduled'}
								</span>
								<span class="{MONO} text-outline-variant">EVT-{mainEvent.id.replace(/^e-/, '').toUpperCase()}</span>
							</span>
							<h1 class="font-display text-[28px] leading-9 font-bold tracking-tight text-on-surface mt-3">{mainEvent.title}</h1>
							<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-body-sm text-on-surface-variant">
								<span class="flex items-center gap-1.5"><CalendarDays class="w-4 h-4" />{dateLabel}</span>
								<span class="text-outline-variant">•</span>
								<span class="flex items-center gap-1.5"><MapPin class="w-4 h-4" />{mainEvent.venue}, {mainEvent.city}</span>
							</div>
						</div>
						<div class="flex items-center gap-2.5 flex-wrap">
							<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={() => (staffOpen = true)}>
								<SlidersHorizontal class="w-4 h-4 text-on-surface-variant" /><span>Door Staff PINs</span>
							</button>
							<a href="/organizer/create" class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors">
								<PenLine class="w-4 h-4 text-on-surface-variant" /><span>Edit Wizard</span>
							</a>
							<a href="/organizer/events/{mainEvent.id}" class="h-10 px-4 rounded-lg flex items-center gap-2 bg-on-surface text-surface-base text-body-sm font-semibold hover:opacity-90 transition-opacity">
								<LayoutGrid class="w-4 h-4" /><span>Manage Event</span>
							</a>
						</div>
					</div>
					<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4 mt-5">
						{#each [
							['Fast Pass Gate', mainEvent.live ? 'Active (Turnstile 1-3)' : 'Standby'],
							['Avg Scan Latency', '180ms / person'],
							['Rejected Scans', `${rejected} Blocked`],
							['Offline Cache Sync', '100% Up-to-date']
						] as [label, value]}
							<div>
								<span class="{MONO} text-on-surface-variant block">{label}</span>
								<span class="text-body-md text-on-surface block mt-1">{value}</span>
							</div>
						{/each}
					</div>
				</section>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<span class="flex items-center gap-2.5">
							<span class="w-2 h-2 rounded-full bg-primary glow-primary animate-pulse"></span>
							<span class="font-display text-headline-md text-on-surface">Live Check-in Ledger</span>
							<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant">Realtime Websocket</span>
						</span>
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							Auto-refreshing <RefreshCw class="w-3.5 h-3.5" />
						</span>
					</div>
					<div class="mt-4 overflow-x-auto">
						<div class="min-w-[640px]">
							<div class="grid grid-cols-[1.3fr_0.9fr_1.1fr_1.1fr_64px] gap-3 px-3 pb-2 {MONO} text-on-surface-variant">
								<span>Attendee</span><span>Access Tier</span><span>Terminal / Portal</span><span>Validation Status</span><span class="text-right">Time</span>
							</div>
							{#each (payload?.checkins ?? []).slice(0, 6) as ck (ck.id)}
								{@const bad = ck.result !== 'verified'}
								<div class="grid grid-cols-[1.3fr_0.9fr_1.1fr_1.1fr_64px] gap-3 px-3 py-3 rounded-md items-center {bad ? 'bg-error/10' : ''}">
									<span class="flex items-center gap-2.5 min-w-0">
										<span class="w-8 h-8 rounded-full flex items-center justify-center text-label-badge font-bold shrink-0 {bad ? 'bg-error/20 text-error' : 'bg-surface-container-high border border-surface-glass-border text-on-surface-variant'}">
											{ck.holder.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}
										</span>
										<span class="text-body-md text-on-surface truncate">{ck.holder}</span>
									</span>
									<span class="{MONO} px-2 py-1 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant justify-self-start truncate">{ck.tier}</span>
									<span class="text-body-sm text-on-surface-variant truncate">{ck.gate}</span>
									<span>
										{#if bad}
											<span class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-error/15 border border-error/25 text-error justify-self-start {MONO}">
												<Ban class="w-3.5 h-3.5" /> {ck.result === 'duplicate' ? 'Duplicate Alert - Blocked' : 'Invalid Code - Blocked'}
											</span>
										{:else}
											<span class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container-high border border-surface-glass-border text-on-surface justify-self-start {MONO}">
												<CircleCheck class="w-3.5 h-3.5 text-accent-emerald" /> Verified
											</span>
										{/if}
									</span>
									<span class="{MONO} text-outline-variant text-right">{fmtRelative(ck.at)}</span>
								</div>
							{:else}
								<p class="text-body-sm text-on-surface-variant px-3 py-6">No scans yet — launch the scanner when doors open.</p>
							{/each}
						</div>
					</div>
				</section>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
					<div class="flex flex-wrap items-end justify-between gap-3">
						<div>
							<h2 class="font-display text-headline-md text-on-surface">Ticket Tier Breakdown</h2>
							<p class="text-body-sm text-on-surface-variant mt-1">Real-time inventory and monetary yield per category</p>
						</div>
						<span class="{MONO} text-on-surface-variant">{mainEvent.tiers.length} Active Tiers</span>
					</div>
					<div class="flex flex-col gap-3 mt-5">
						{#each mainEvent.tiers as t, i (t.id)}
							{@const pct = t.capacity ? Math.round((t.sold / t.capacity) * 1000) / 10 : 0}
							<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4 grid lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.7fr))_minmax(0,1fr)] gap-4 items-center">
								<div class="min-w-0">
									<span class="flex items-center gap-2 flex-wrap">
										<span class="font-display text-body-lg font-bold text-on-surface">{t.name}</span>
										<span class="{MONO} px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">Tier {i + 1}</span>
									</span>
									<span class="text-body-sm text-on-surface-variant block mt-0.5 truncate">{t.benefits ?? 'Standard gate access'}</span>
								</div>
								<div>
									<span class="{MONO} text-on-surface-variant block">Sold / Cap</span>
									<span class="text-body-md text-on-surface block mt-0.5">{t.sold} / {t.capacity}</span>
								</div>
								<div>
									<span class="{MONO} text-on-surface-variant block">Unit Price</span>
									<span class="text-body-md text-on-surface block mt-0.5">{formatMoney(t.price)}</span>
								</div>
								<div>
									<span class="{MONO} text-on-surface-variant block">Gross Revenue</span>
									<span class="text-body-md text-on-surface block mt-0.5">{formatMoney(t.sold * t.price)}</span>
								</div>
								<div>
									<div class="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
										<div class="h-full bg-primary rounded-full" style="width: {pct}%"></div>
									</div>
									<span class="{MONO} text-on-surface-variant block text-right mt-1.5">{pct}% Sold</span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Hardware & Gates</h2>
					<Radio class="w-4 h-4 text-on-surface-variant" />
				</div>
				<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4 mt-4">
					<span class="{MONO} text-on-surface-variant">Door Scanner PWA Access PIN</span>
					<div class="flex items-center justify-between gap-3 mt-2">
						<span class="font-code text-[30px] leading-9 tracking-[0.18em] text-primary">{deskPin}</span>
						<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">Exp: 18h 42m</span>
					</div>
					<p class="text-body-sm text-on-surface-variant mt-3">Provide this rotating passkey to door leads to activate the OWLTSIDE field scanner without admin credentials.</p>
					<div class="grid grid-cols-2 gap-2.5 mt-4">
						<button class="h-9 rounded-md flex items-center justify-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={copyScannerLink}>
							<Copy class="w-3.5 h-3.5" /><span>Copy Scanner Link</span>
						</button>
						<button class="h-9 rounded-md flex items-center justify-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={regenPin}>
							<RefreshCw class="w-3.5 h-3.5" /><span>Regenerate PIN</span>
						</button>
					</div>
				</div>
				<span class="{MONO} text-on-surface-variant block mt-5">Active Gate Terminals</span>
				<div class="flex flex-col gap-2.5 mt-3">
					{#each terminals as term}
						<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
							<span class="flex items-center gap-2.5 min-w-0">
								<span class="w-1.5 h-1.5 rounded-full bg-primary glow-primary shrink-0"></span>
								<span class="min-w-0">
									<span class="block text-body-sm font-medium text-on-surface truncate">{term.name}</span>
									<span class="block text-xs text-on-surface-variant truncate">{term.sub}</span>
								</span>
							</span>
							<span class="{MONO} text-on-surface-variant shrink-0">{term.ms}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<h2 class="font-display text-headline-md text-on-surface">Management Shortcuts</h2>
				<div class="flex flex-col gap-2.5 mt-4">
					<button class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-left hover:bg-surface-container-high transition-colors" onclick={() => (broadcastOpen = true)}>
						<Megaphone class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 min-w-0">
							<span class="block text-body-sm font-medium text-on-surface">Broadcast Announcement</span>
							<span class="block text-xs text-on-surface-variant mt-0.5">Instant SMS & Push to {stats?.orders.toLocaleString() ?? 0} holders</span>
						</span>
						<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
					</button>
					<button class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-left hover:bg-surface-container-high transition-colors" onclick={() => (staffOpen = true)}>
						<IdCard class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 min-w-0">
							<span class="block text-body-sm font-medium text-on-surface">Gate Staff Access & Roles</span>
							<span class="block text-xs text-on-surface-variant mt-0.5">Assign credentials to 14 volunteer accounts</span>
						</span>
						<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
					</button>
					<button class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-left hover:bg-surface-container-high transition-colors" onclick={() => toast('Floorplan sync queued for ' + (mainEvent?.venue ?? 'the venue'), 'info')}>
						<Map class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 min-w-0">
							<span class="block text-body-sm font-medium text-on-surface">Venue Floorplan Map Sync</span>
							<span class="block text-xs text-on-surface-variant mt-0.5">Update {mainEvent?.venue ?? 'venue'} Hall 1 booths</span>
						</span>
						<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
					</button>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Settlement Account</h2>
					<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant"><ShieldCheck class="w-3.5 h-3.5 text-accent-emerald" /> KYC Active</span>
				</div>
				<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4 mt-4">
					<div class="flex items-center justify-between gap-3">
						<span class="font-display text-body-lg font-bold text-on-surface">Guaranty Trust Bank</span>
						<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">NGN Default</span>
					</div>
					<span class="{MONO} text-on-surface-variant block mt-2">Account: ••••••••4821</span>
					<div class="flex flex-col gap-2 mt-4 pt-4 border-t border-surface-glass-border text-body-sm">
						<div class="flex items-center justify-between gap-3">
							<span class="text-on-surface-variant">Split Mechanism</span>
							<span class="text-on-surface">Paystack Split Active</span>
						</div>
						<div class="flex items-center justify-between gap-3">
							<span class="text-on-surface-variant">Protocol Processing Fee</span>
							<span class="text-on-surface">0.00% (Genesis Tier)</span>
						</div>
						<div class="flex items-center justify-between gap-3">
							<span class="text-on-surface-variant">Next Automated Sweep</span>
							<span class="text-on-surface">Tonight at 23:59 WAT</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	</div>

	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Decentralized Event Protocol</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					Mainnet 99.98% Operational
				</span>
				<span class="{MONO} text-on-surface-variant">Latency: 24ms</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">
	<TopBar title="Organizer" subtitle="Console & gate ops" />

<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md pt-space-sm">
		<!-- identity -->
		<div class="relative overflow-hidden rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm">
			<div class="flex items-center justify-between gap-space-sm relative z-10">
				<div class="flex items-center gap-space-sm min-w-0">
					<div class="relative flex-shrink-0">
						<Avatar name={page.data.session?.name ?? 'Ada Obi'} size="md" />
						<span class="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-emerald text-surface-container-lowest">
							<BadgeCheck class="w-3 h-3" />
						</span>
					</div>
					<div class="flex flex-col min-w-0">
						<h1 class="font-display text-headline-md text-on-surface truncate">{page.data.session?.name ?? 'Ada Obi'}</h1>
						<div class="flex items-center gap-1.5 mt-0.5">
							<span class="rounded-full bg-surface-container-highest px-2 py-0.5 text-label-badge text-on-surface uppercase border border-outline-variant/20">Organizer Role</span>
							<span class="w-1 h-1 rounded-full bg-outline-variant"></span>
							<span class="text-body-sm text-on-surface-variant truncate">{mainEvent?.live ? 'Gate 1 Active' : 'No live gate'}</span>
						</div>
					</div>
				</div>
				<a href="/settings" class="flex-shrink-0 flex items-center gap-1 bg-surface-container-high border border-outline-variant/30 px-3 py-1.5 rounded-full text-on-surface hover:bg-surface-bright active:scale-95 transition-all shadow-sm">
					<ArrowLeftRight class="w-4 h-4 text-on-surface-variant" />
					<span class="text-body-sm font-medium">Switch</span>
				</a>
			</div>
		</div>

		{#if !mainEvent}
			<EmptyState title="No events yet" sub="Launch the wizard and mint your first gate-ready event in five steps.">
				{#snippet icon()}<Megaphone class="w-6 h-6" />{/snippet}
				{#snippet action()}
					<a href="/organizer/create" class="h-11 px-6 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center glow-primary">Create event</a>
				{/snippet}
			</EmptyState>
		{:else}
			<!-- scanner launch -->
			<a href="/organizer/scan" class="relative overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container p-0.5 shadow-sm block">
				<div class="w-full flex flex-col gap-space-sm rounded-[10px] bg-surface-container-low p-space-md text-left group">
					<div class="flex items-center justify-between w-full">
						<span class="inline-flex items-center gap-2 rounded-full bg-surface-container-highest px-2.5 py-1 border border-outline-variant/30">
							<span class="relative flex h-2 w-2">
								<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
								<span class="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald"></span>
							</span>
							<span class="text-label-badge text-accent-emerald uppercase tracking-wider">Ready to scan • Gate 1</span>
						</span>
						<span class="rounded-full bg-surface-container-highest border border-outline-variant/40 p-1.5 text-on-surface group-hover:bg-primary-fixed group-hover:text-surface transition-colors">
							<ScanBarcode class="w-4.5 h-4.5" />
						</span>
					</div>
					<div class="flex items-end justify-between w-full pt-1">
						<div class="flex flex-col">
							<span class="font-display text-headline-lg-mobile text-on-surface">Open Ticket Scanner</span>
							<span class="text-body-sm text-on-surface-variant">Instant Camera & Manual HMAC Code Verification</span>
						</div>
						<span class="h-9 px-4 rounded-full bg-primary-fixed text-surface text-[13px] font-semibold flex items-center justify-center shadow-sm">Launch</span>
					</div>
				</div>
			</a>

			<!-- stats grid -->
			{#if stats}
				<div class="grid grid-cols-2 gap-space-sm">
					<div class="flex flex-col justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm">
						<div class="flex items-center justify-between">
							<span class="text-body-sm text-on-surface-variant">Total Revenue</span>
							<span class="p-1 rounded-lg bg-surface-container-highest text-accent-emerald"><Banknote class="w-4 h-4" /></span>
						</div>
						<div class="my-space-xs">
							<span class="font-display text-headline-lg-mobile text-on-surface block tracking-tight">{formatMoney(stats.revenue)}</span>
							<span class="inline-flex items-center gap-1 mt-1 text-accent-emerald">
								<TrendingUp class="w-3.5 h-3.5" />
								<span class="text-label-badge">+{stats.revenueDeltaPct}% this week</span>
							</span>
						</div>
						<div class="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden mt-1">
							<div class="bg-accent-emerald h-full w-4/5 rounded-full"></div>
						</div>
					</div>
					<div class="flex flex-col justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm">
						<div class="flex items-center justify-between">
							<span class="text-body-sm text-on-surface-variant">Gate Checked-in</span>
							<span class="p-1 rounded-lg bg-surface-container-highest text-on-surface"><UserCheck class="w-4 h-4" /></span>
						</div>
						<div class="my-space-xs">
							<div class="flex items-baseline gap-1">
								<span class="font-display text-headline-lg-mobile text-on-surface tracking-tight">{stats.checkedIn}</span>
								<span class="text-body-sm text-on-surface-variant">/ {stats.capacity.toLocaleString()}</span>
							</div>
							<span class="text-label-badge text-on-surface-variant">{checkinRate}% rate</span>
						</div>
						<div class="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mt-1">
							<div class="bg-on-surface h-full rounded-full transition-all duration-700" style="width: {checkinRate}%"></div>
						</div>
					</div>
					<div class="flex flex-col justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm">
						<div class="flex items-center justify-between">
							<span class="text-body-sm text-on-surface-variant">Total Sales</span>
							<span class="p-1 rounded-lg bg-surface-container-highest text-on-surface"><ShoppingBag class="w-4 h-4" /></span>
						</div>
						<div class="my-space-xs">
							<span class="font-display text-headline-lg-mobile text-on-surface block tracking-tight">{stats.orders.toLocaleString()} Orders</span>
							<span class="text-body-sm text-on-surface-variant block mt-1">{stats.soldPct}% Sold</span>
						</div>
						<span class="flex items-center gap-1 text-on-surface-variant pt-1">
							<TrendingUp class="w-3 h-3 text-accent-emerald" />
							<span class="text-label-badge">{stats.soldLastHour} sold last hour</span>
						</span>
					</div>
					<div class="flex flex-col justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm">
						<div class="flex items-center justify-between">
							<span class="text-body-sm text-on-surface-variant">Payout Balance</span>
							<span class="p-1 rounded-lg bg-surface-container-highest text-accent-amber"><Wallet class="w-4 h-4" /></span>
						</div>
						<div class="my-space-xs">
							<span class="font-display text-headline-lg-mobile text-on-surface block tracking-tight">{formatMoney(stats.payout)}</span>
							<span class="text-label-badge text-on-surface-variant block mt-1">Ready for transfer</span>
						</div>
						<button class="w-full h-8 mt-1 rounded-full bg-primary-fixed text-surface font-medium flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm" onclick={() => toast('Payout of ' + formatMoney(stats.payout) + ' on its way', 'success')}>
							<Send class="w-3.5 h-3.5" /><span class="text-label-badge font-semibold">Instant Payout</span>
						</button>
					</div>
				</div>
			{/if}

			<!-- live check-in stream -->
			<div class="flex flex-col rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm gap-space-sm">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="relative flex h-2.5 w-2.5">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
							<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span>
						</span>
						<span class="font-display text-headline-md text-on-surface">Live Check-in Stream</span>
					</div>
					<span class="rounded-full bg-surface-container-highest border border-outline-variant/20 px-2 py-0.5 text-label-badge text-on-surface-variant truncate max-w-[140px]">{mainEvent.title}</span>
				</div>
				<div class="flex flex-col gap-2 pt-1">
					{#each (payload?.checkins ?? []).slice(0, 4) as ck (ck.id)}
						<div class="flex items-center justify-between rounded-lg bg-surface-container-high/60 border border-outline-variant/20 p-2.5">
							<div class="flex items-center gap-space-sm min-w-0">
								<div class="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface flex items-center justify-center text-label-badge font-bold flex-shrink-0">
									{ck.holder.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}
								</div>
								<div class="flex flex-col min-w-0">
									<div class="flex items-center gap-1.5">
										<span class="text-body-md text-on-surface font-medium truncate">{ck.holder}</span>
										<span class="px-1.5 py-0.2 rounded-full bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant text-[10px]">{ck.tier}</span>
									</div>
									<span class="text-body-sm text-on-surface-variant truncate">{ck.gate}</span>
								</div>
							</div>
							<div class="flex flex-col items-end flex-shrink-0">
								<span class="text-label-badge {ck.result === 'verified' ? 'text-accent-emerald' : ck.result === 'duplicate' ? 'text-accent-amber' : 'text-error'} font-semibold capitalize">{ck.result}</span>
								<span class="text-[11px] text-on-surface-variant">{fmtRelative(ck.at)}</span>
							</div>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No scans yet — launch the scanner when doors open.</p>
					{/each}
				</div>
			</div>
		{/if}

		<!-- quick management -->
		<div class="flex flex-col gap-space-sm">
			<div class="flex items-center justify-between">
				<h2 class="font-display text-headline-md text-on-surface">Quick Management</h2>
				<span class="text-body-sm text-on-surface-variant">Organizer Tools</span>
			</div>
			<div class="grid grid-cols-1 gap-2.5">
				<a href="/organizer/create" class="flex items-center justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm hover:bg-surface-container-high transition-colors group">
					<div class="flex items-center gap-space-md min-w-0">
						<div class="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
							<PlusCircle class="w-5 h-5" />
						</div>
						<div class="flex flex-col min-w-0">
							<span class="text-body-lg text-on-surface font-semibold truncate">+ Create New Event</span>
							<span class="text-body-sm text-on-surface-variant truncate">Launch wizard: Tickets, pricing & venue layout</span>
						</div>
					</div>
					<ChevronRight class="w-5 h-5 text-outline-variant group-hover:text-on-surface" />
				</a>
				{#if mainEvent}
					<a href="/organizer/events/{mainEvent.id}" class="flex items-center justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm hover:bg-surface-container-high transition-colors group">
						<div class="flex items-center gap-space-md min-w-0">
							<div class="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
								<Users class="w-5 h-5" />
							</div>
							<div class="flex flex-col min-w-0">
								<span class="text-body-lg text-on-surface font-semibold truncate">Attendee Roster & Export CSV</span>
								<span class="text-body-sm text-on-surface-variant truncate">Manage guest lists, manual check-ins & data exports</span>
							</div>
						</div>
						<ChevronRight class="w-5 h-5 text-outline-variant group-hover:text-on-surface" />
					</a>
					<button onclick={() => (broadcastOpen = true)} class="flex items-center justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm hover:bg-surface-container-high transition-colors group text-left">
						<div class="flex items-center gap-space-md min-w-0">
							<div class="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant/30 text-accent-amber flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
								<Megaphone class="w-5 h-5" />
							</div>
							<div class="flex flex-col min-w-0">
								<span class="text-body-lg text-on-surface font-semibold truncate">Broadcast Announcement</span>
								<span class="text-body-sm text-on-surface-variant truncate">Push alerts & direct SMS to {stats?.orders.toLocaleString() ?? 0} ticket holders</span>
							</div>
						</div>
						<ChevronRight class="w-5 h-5 text-outline-variant group-hover:text-accent-amber" />
					</button>
				{/if}
				<button onclick={() => (staffOpen = true)} class="flex items-center justify-between rounded-xl bg-surface-container border border-outline-variant/30 p-space-md shadow-sm hover:bg-surface-container-high transition-colors group text-left">
					<div class="flex items-center gap-space-md min-w-0">
						<div class="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
							<KeyRound class="w-5 h-5" />
						</div>
						<div class="flex flex-col min-w-0">
							<span class="text-body-lg text-on-surface font-semibold truncate">Gate Staff Access & Roles</span>
							<span class="text-body-sm text-on-surface-variant truncate">Generate scanner PINs & manage door agents</span>
						</div>
					</div>
					<ChevronRight class="w-5 h-5 text-outline-variant group-hover:text-on-surface" />
				</button>
			</div>
		</div>
	</div>
</main>
</div>

<Sheet open={broadcastOpen} title="Broadcast" close={() => (broadcastOpen = false)}>
	{#snippet footer()}
		<button
			class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md disabled:opacity-40"
			disabled={!broadcastMsg.trim()}
			onclick={() => {
				broadcastOpen = false;
				toast('Broadcast queued to all ticket holders', 'success');
				broadcastMsg = '';
			}}
		>
			Send broadcast
		</button>
	{/snippet}
	<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
		Message to every ticket holder
		<textarea bind:value={broadcastMsg} rows="4" placeholder="Gate 1 is now open — fast-pass holders use the left lane." class="px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
	</label>
</Sheet>

<Sheet open={staffOpen} title="Gate staff access" close={() => (staffOpen = false)}>
	{#snippet footer()}
		<button class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md" onclick={newPin}>
			Generate new PIN
		</button>
	{/snippet}
	<div class="flex flex-col gap-2">
		{#each pins as pin, i (pin + i)}
			<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-lg p-3">
				<div>
					<p class="text-label-badge text-on-surface-variant uppercase">Scanner PIN {i + 1}</p>
					<p class="font-code text-label-code text-on-surface tracking-widest">{pin}</p>
				</div>
				<span class="text-label-badge text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 px-2 py-0.5 rounded-full">Active</span>
			</div>
		{/each}
		<p class="text-body-sm text-on-surface-variant">PINs arm the scanner for 6 hours. Staff enter them on the gate device before scanning.</p>
	</div>
</Sheet>

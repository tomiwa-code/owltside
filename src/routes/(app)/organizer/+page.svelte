<script lang="ts">
	import {
		ArrowLeftRight,
		BadgeCheck,
		Banknote,
		ChevronRight,
		UserCheck,
		KeyRound,
		Megaphone,
		PlusCircle,
		ScanBarcode,
		Send,
		ShoppingBag,
		TrendingUp,
		Users,
		Wallet
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import { page } from '$app/state';
	import { useQuery } from '$lib/state/query.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { formatMoney } from '$lib/utils/money';
	import { fmtRelative } from '$lib/utils/dates';
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
</script>

<svelte:head><title>Organizer Console • Owltside</title></svelte:head>

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

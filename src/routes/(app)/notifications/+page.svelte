<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import {
		Bell,
		CheckCheck,
		FingerprintPattern,
		Flame,
		Mail,
		Megaphone,
		MessageSquare,
		Network,
		QrCode,
		Search,
		Settings2,
		ShieldCheck,
		SlidersHorizontal,
		Smartphone,
		Ticket,
		X,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { useQuery, queryClient } from '$lib/state/query.svelte';
	import { fmtRelative, fmtTime } from '$lib/utils/dates';
	import type { NotificationItem } from '$lib/types';

	let { data } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const items = useQuery<NotificationItem[]>(
		'notifications:mine',
		async () => (await fetch('/api/notifications')).json(),
		{ staleTime: 15_000, refetchInterval: 30_000 },
		data.items
	);

	// Desktop and mobile share filter, dismissal, and delivery-preference state.
	let deskFilter = $state<'all' | 'tickets' | 'security' | 'events' | 'organizers'>('all');
	let dismissed = $state<string[]>([]);
	let showMobilePrefs = $state(false);

	const kindToDesk: Record<NotificationItem['kind'], Exclude<typeof deskFilter, 'all'>> = {
		ticket: 'tickets',
		system: 'security',
		event: 'events',
		promo: 'events',
		social: 'organizers'
	};

	const deskMeta: Record<
		NotificationItem['kind'],
		{
			code: string;
			source: string;
			icon: typeof QrCode;
			tag?: string;
			action?: { label: string; href: string; solid?: boolean };
		}
	> = {
		ticket: {
			code: 'Pass_Security',
			source: 'Gate 02 Sync',
			icon: QrCode,
			tag: 'Verified Turnstile',
			action: { label: 'View Ticket', href: '/tickets', solid: true }
		},
		event: {
			code: 'Broadcast',
			source: 'Organizer Protocol',
			icon: Megaphone,
			action: { label: 'View Event Schedule', href: '/explore' }
		},
		social: {
			code: 'Organizer_Direct',
			source: 'Direct Message',
			icon: MessageSquare,
			action: { label: 'Open Chat', href: '/inbox' }
		},
		promo: {
			code: 'Capacity_Alert',
			source: 'Marketplace Node',
			icon: Flame,
			action: { label: 'Get Tickets', href: '/explore' }
		},
		system: { code: 'Security_Node', source: 'Mesh Validator', icon: FingerprintPattern }
	};

	const deskItems = $derived((items.data ?? []).filter((n) => !dismissed.includes(n.id)));
	const deskList = $derived(
		deskItems.filter((n) => deskFilter === 'all' || kindToDesk[n.kind] === deskFilter)
	);
	const deskUnread = $derived(deskItems.filter((n) => !n.read).length);
	const deskWeek = $derived(
		deskItems.filter((n) => Date.now() - +new Date(n.at) < 7 * 86400000).length
	);

	const deskChips = $derived(
		[
			['all', 'All Alerts', deskItems.length],
			['tickets', 'Tickets & Passes', deskItems.filter((n) => kindToDesk[n.kind] === 'tickets').length],
			['security', 'Security & Gates', deskItems.filter((n) => kindToDesk[n.kind] === 'security').length],
			['events', 'Event Updates', deskItems.filter((n) => kindToDesk[n.kind] === 'events').length],
			['organizers', 'Organizers', deskItems.filter((n) => kindToDesk[n.kind] === 'organizers').length]
		] as [typeof deskFilter, string, number][]
	);

	const dayKey = (iso: string): 'today' | 'yesterday' | 'earlier' => {
		const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const diff = Math.round((sod(new Date()) - sod(new Date(iso))) / 86400000);
		return diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : 'earlier';
	};

	const deskGroups = $derived(
		(
			[
				['today', 'Today', 'pending'],
				['yesterday', 'Yesterday', 'archived'],
				['earlier', 'Earlier', 'historical']
			] as ['today' | 'yesterday' | 'earlier', string, string][]
		)
			.map(([key, label, mode]) => {
				const rows = deskList.filter((n) => dayKey(n.at) === key);
				if (!rows.length) return null;
				const right =
					mode === 'pending'
						? `${rows.filter((n) => !n.read).length} Alerts Pending`
						: mode === 'archived'
							? `${rows.length} Archived Logs`
							: `${rows.length} Historical Records`;
				return { key, label, right, rows };
			})
			.filter(Boolean) as { key: string; label: string; right: string; rows: NotificationItem[] }[]
	);

	const deskTime = (n: NotificationItem) =>
		dayKey(n.at) === 'yesterday' ? `Yesterday at ${fmtTime(n.at)}` : fmtRelative(n.at);

	const pad2 = (n: number) => String(n).padStart(2, '0');

	let pipes = $state([
		{ id: 'hud', label: 'In-App HUD', sub: 'Real-time gate toasts', icon: Smartphone, on: true },
		{ id: 'push', label: 'Browser Push', sub: 'HMAC rotation pings', icon: Bell, on: true },
		{ id: 'email', label: 'Email Digests', sub: 'Nightly gate settlement', icon: Mail, on: false },
		{ id: 'sms', label: 'Urgent WhatsApp / SMS', sub: 'Emergency turnstile override', icon: Zap, on: true }
	]);

	const meshBars = [26, 34, 46, 38, 52, 66, 92, 44, 40, 34, 56, 30];
</script>

<svelte:head><title>Activity Hub • Owltside</title></svelte:head>

<!-- ── desktop (md+) "Audit Stream" notifications center per the desktop design
     source, themed with Evently Pulse tokens; mobile activity hub below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-50 border-b border-surface-glass-border bg-surface-base/85 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center gap-5">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
				<span class="{MONO} text-tertiary border border-tertiary/25 bg-tertiary/10 rounded px-1.5 py-0.5">Secure_Node</span>
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
						class="px-3 h-9 rounded-lg flex items-center text-body-sm text-on-surface-variant hover:text-on-surface transition-colors"
					>
						{label}
					</a>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<span class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, gates, artists…</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</span>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7E3…A14</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">GATE_PASS_ACTIVE</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name={page.data.session?.name ?? 'Guest'} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-2 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
				<span>Audit_Stream</span>
				<span class="text-outline-variant">/</span>
				<span>Terminal_RX</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Notifications & System Alerts</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Real-time security telemetry, smart pass rotation states, and verified organizer dispatches.</p>
		</div>
		<div class="flex items-center gap-3">
			<form method="POST" action="?/markAll" use:enhance={() => async ({ result }) => {
				if (result.type === 'success') queryClient.invalidate('notifications');
			}}>
				<button class="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors">
					<CheckCheck class="w-4 h-4 text-primary" /><span>Mark all read</span>
				</button>
			</form>
			<button
				class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors"
				aria-label="Alert preferences"
				onclick={() => document.getElementById('delivery-pipelines')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
			>
				<SlidersHorizontal class="w-4 h-4" />
			</button>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-wrap items-center gap-2">
		{#each deskChips as [id, label, count]}
			<button
				class="flex items-center gap-2 h-9 px-4 rounded-lg border text-body-sm transition-colors {deskFilter === id ? 'bg-surface-container-high border-surface-glass-border text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'}"
				onclick={() => (deskFilter = id)}
			>
				<span>{label}</span>
				<span class="{MONO} px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">{count}</span>
			</button>
		{/each}
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pb-10 grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
		<div class="flex flex-col gap-5">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
				<div class="flex items-center justify-between">
					<span class="{MONO} text-on-surface-variant">Telemetry_Status</span>
					<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
						<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Synced
					</span>
				</div>
				<div class="grid grid-cols-2 gap-3 mt-4">
					<div class="rounded-lg border border-surface-glass-border bg-surface-container-high p-4">
						<span class="font-code text-[28px] leading-8 text-on-surface">{pad2(deskUnread)}</span>
						<p class="text-body-sm text-on-surface-variant mt-1">Pending Unread</p>
					</div>
					<div class="rounded-lg border border-surface-glass-border bg-surface-container-high p-4">
						<span class="font-code text-[28px] leading-8 text-on-surface">{pad2(deskWeek)}</span>
						<p class="text-body-sm text-on-surface-variant mt-1">Recorded 7-Days</p>
					</div>
				</div>
				<div class="flex items-center justify-between mt-5">
					<span class="text-body-sm text-on-surface-variant">Mesh Queue Flow</span>
					<span class="{MONO} text-on-surface-variant">4.2 msg/sec</span>
				</div>
				<div class="flex items-end gap-1.5 h-12 mt-2" aria-hidden="true">
					{#each meshBars as h, i}
						<span
							class="flex-1 rounded-sm {i === 6 ? 'bg-primary' : i === 5 ? 'bg-primary/50' : 'bg-surface-container-highest'}"
							style="height: {h}%"
						></span>
					{/each}
				</div>
			</section>

			<section id="delivery-pipelines" class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
				<div class="flex items-center justify-between">
					<span class="{MONO} text-on-surface-variant">Delivery_Pipelines</span>
					<Network class="w-4 h-4 text-on-surface-variant" />
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each pipes as p}
						{@const PIcon = p.icon}
						<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high px-3 py-2.5">
							<span class="w-8 h-8 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
								<PIcon class="w-4 h-4 text-on-surface-variant" />
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-sm font-medium text-on-surface">{p.label}</span>
								<span class="block text-xs text-on-surface-variant">{p.sub}</span>
							</span>
							<button
								role="switch"
								aria-checked={p.on}
								aria-label={p.label}
								class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors {p.on ? 'bg-primary-container border-primary/50 text-on-primary-container' : 'bg-surface-bright border-surface-glass-border text-transparent'}"
								onclick={() => (p.on = !p.on)}
							>
								<CheckCheck class="w-3 h-3" />
							</button>
						</div>
					{/each}
				</div>
				<div class="flex items-center justify-between mt-4">
					<span class="text-xs text-on-surface-variant">Latency SLA</span>
					<span class="{MONO} text-on-surface-variant">&lt; 180ms Guaranteed</span>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container-high px-4 py-3 flex items-center justify-between gap-3">
				<span class="flex items-center gap-2 min-w-0">
					<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
					<span class="{MONO} text-on-surface-variant truncate">Secure_Channel: RSA-4096 / TLS 1.3</span>
				</span>
				<span class="{MONO} text-outline-variant shrink-0">v2.4.1</span>
			</section>
		</div>

		<div class="flex flex-col gap-8 min-w-0">
			{#each deskGroups as g (g.key)}
				<section>
					<div class="flex items-center justify-between pb-3">
						<span class="flex items-center gap-2 {MONO} text-on-surface">
							<span class="w-1.5 h-1.5 rounded-full bg-primary glow-primary"></span>{g.label}
						</span>
						<span class="{MONO} text-outline-variant">{g.right}</span>
					</div>
					<div class="flex flex-col gap-4">
						{#each g.rows as n (n.id)}
							{@const meta = deskMeta[n.kind]}
							{@const Icon = meta.icon}
							<article class="relative rounded-lg border border-surface-glass-border bg-surface-container p-5 pr-12 border-l-[3px] {n.read ? 'border-l-transparent' : 'border-l-primary'}">
								<button
									class="absolute top-4 right-4 w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
									aria-label="Dismiss notification"
									onclick={() => (dismissed = [...dismissed, n.id])}
								>
									<X class="w-4 h-4" />
								</button>
								<div class="flex items-start gap-4">
									<span class="w-11 h-11 rounded-md bg-surface-container-high border border-surface-glass-border flex items-center justify-center shrink-0">
										<Icon class="w-5 h-5 text-on-surface-variant" />
									</span>
									<div class="flex-1 min-w-0">
										<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
											<span class="{MONO} text-on-surface-variant">{meta.code}</span>
											<span class="{MONO} text-outline-variant">{meta.source}</span>
											{#if meta.tag}
												<span class="flex items-center gap-1.5 {MONO} text-on-surface">
													<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>{meta.tag}
												</span>
											{/if}
										</div>
										<h3 class="font-display text-[15px] font-bold text-on-surface mt-1.5">{n.title}</h3>
										<p class="text-body-sm text-on-surface-variant mt-1">{n.body}</p>
										<div class="flex items-center gap-3 mt-3">
											{#if meta.action}
												<a
													href={meta.action.href}
													class="h-9 px-4 rounded-md flex items-center text-body-sm transition-colors {meta.action.solid ? 'bg-primary-container text-on-primary-container hover:bg-primary/30' : 'bg-surface-container-high border border-surface-glass-border text-on-surface hover:bg-surface-bright'}"
												>
													{meta.action.label}
												</a>
											{/if}
											<span class="{MONO} text-outline-variant">{deskTime(n)}</span>
										</div>
									</div>
								</div>
							</article>
						{/each}
					</div>
				</section>
			{:else}
				<section class="rounded-xl border border-surface-glass-border bg-surface-container min-h-[320px] flex flex-col items-center justify-center gap-3 p-10 text-center">
					<span class="w-12 h-12 rounded-xl bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center">
						<Bell class="w-5 h-5" />
					</span>
					<h2 class="font-display text-headline-md text-on-surface">All quiet</h2>
					<p class="text-body-sm text-on-surface-variant max-w-sm">New passes, security rotations and organizer dispatches will land in this stream.</p>
					<span class="{MONO} text-on-surface-variant">Audit_Stream Idle • Node 0x7E3</span>
				</section>
			{/each}
		</div>
	</div>

	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">
	<TopBar title="Activity Hub" subtitle="Passes, drops & messages">
		{#snippet right()}
			<button aria-label="Delivery preferences" aria-expanded={showMobilePrefs} onclick={() => (showMobilePrefs = !showMobilePrefs)} class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
				<SlidersHorizontal class="w-5 h-5" />
			</button>
		{/snippet}
	</TopBar>

	<main class="flex-1 flex flex-col relative w-full pt-mobile-header pb-28 md:pb-16 bg-surface min-h-dvh">
		<div class="flex flex-col w-full md:max-w-2xl md:mx-auto pb-8">
			<div class="px-space-md pt-space-md pb-space-sm flex items-center justify-between gap-2">
				<div class="flex items-center gap-space-xs min-w-0">
					<span class="font-display text-headline-md text-on-surface">Activity Hub</span>
					{#if deskUnread > 0}
						<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-label-badge tracking-wider shrink-0">{deskUnread} NEW</span>
					{/if}
				</div>
				<form method="POST" action="?/markAll" use:enhance={() => async ({ result }) => {
					if (result.type === 'success') queryClient.invalidate('notifications');
				}}>
					<button disabled={deskUnread === 0} class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-bright text-primary text-body-sm transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap">
						<CheckCheck class="w-4 h-4" /><span>Mark all read</span>
					</button>
				</form>
			</div>

			<div class="w-full overflow-x-auto px-space-md py-space-xs flex gap-space-xs scrollbar-none">
				{#each deskChips as [id, label, count]}
					<button
						class="whitespace-nowrap flex items-center gap-2 px-3.5 py-2 rounded-full text-label-badge transition-all {deskFilter === id ? 'bg-primary-container text-on-primary-container font-medium shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (deskFilter = id)}
					>
						<span>{label}</span><span class="font-code text-[10px] opacity-75">{count}</span>
					</button>
				{/each}
			</div>

			<div class="px-space-md mt-space-sm flex flex-col gap-space-sm">
				<section class="rounded-2xl border border-surface-glass-border bg-surface-container p-space-md">
					<div class="flex items-center justify-between gap-2">
						<span class="text-label-badge uppercase tracking-wider text-on-surface-variant">Telemetry status</span>
						<span class="flex items-center gap-1.5 text-label-badge text-accent-emerald"><span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>Synced</span>
					</div>
					<div class="grid grid-cols-2 gap-2 pt-3">
						<div class="rounded-xl bg-surface-container-high border border-surface-glass-border p-3"><span class="font-code text-headline-md text-on-surface">{pad2(deskUnread)}</span><span class="block text-label-badge text-on-surface-variant pt-1">Pending unread</span></div>
						<div class="rounded-xl bg-surface-container-high border border-surface-glass-border p-3"><span class="font-code text-headline-md text-on-surface">{pad2(deskWeek)}</span><span class="block text-label-badge text-on-surface-variant pt-1">Recorded 7 days</span></div>
					</div>
					<div class="flex items-center justify-between pt-3 text-label-badge text-on-surface-variant"><span>Mesh queue flow</span><span class="font-code">4.2 msg/sec</span></div>
					<div class="flex items-end gap-1 h-8 pt-1" aria-hidden="true">{#each meshBars as height, i}<span class="flex-1 rounded-sm {i === 6 ? 'bg-primary' : i === 5 ? 'bg-primary/50' : 'bg-surface-container-highest'}" style="height: {height}%"></span>{/each}</div>
				</section>

				{#if showMobilePrefs}
					<section class="rounded-2xl border border-surface-glass-border bg-surface-container p-space-md">
						<div class="flex items-center justify-between gap-2"><span class="text-label-badge uppercase tracking-wider text-on-surface-variant">Delivery pipelines</span><Network class="w-4 h-4 text-primary" /></div>
						<div class="flex flex-col gap-2 pt-3">
							{#each pipes as p}
								{@const PIcon = p.icon}
								<div class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high px-3 py-2.5">
									<span class="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0"><PIcon class="w-4 h-4 text-on-surface-variant" /></span>
									<span class="flex-1 min-w-0"><span class="block text-body-sm font-medium text-on-surface">{p.label}</span><span class="block text-label-badge text-on-surface-variant">{p.sub}</span></span>
									<button type="button" role="switch" aria-checked={p.on} aria-label={p.label} onclick={() => (p.on = !p.on)} class="w-11 h-6 rounded-full p-0.5 transition-colors {p.on ? 'bg-primary' : 'bg-surface-container-highest'}"><span class="block w-5 h-5 rounded-full bg-white transition-transform {p.on ? 'translate-x-5' : ''}"></span></button>
								</div>
							{/each}
						</div>
						<div class="flex items-center justify-between pt-3 text-label-badge text-on-surface-variant"><span>Latency SLA</span><span class="font-code">&lt; 180ms Guaranteed</span></div>
						<div class="mt-3 rounded-xl bg-surface-container-high px-3 py-2.5 flex items-center gap-2 text-label-badge text-on-surface-variant"><ShieldCheck class="w-4 h-4 text-accent-emerald" />Secure channel: RSA-4096 / TLS 1.3</div>
					</section>
				{/if}
			</div>

			<div class="flex flex-col gap-space-md px-space-md mt-space-md">
				{#each deskGroups as group (group.key)}
					<section class="flex flex-col gap-space-xs">
						<div class="flex items-center justify-between px-1"><span class="flex items-center gap-2 text-label-badge uppercase tracking-wider text-on-surface"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span>{group.label}</span><span class="text-label-badge text-on-surface-variant">{group.right}</span></div>
						{#each group.rows as n (n.id)}
							{@const meta = deskMeta[n.kind]}
							{@const Icon = meta.icon}
							<article class="relative p-space-md pr-12 rounded-xl bg-surface-container border border-surface-glass-border border-l-[3px] transition-all {n.read ? 'border-l-transparent' : 'border-l-primary'}">
								<button class="absolute top-2 right-2 w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-container-high" aria-label="Dismiss notification" onclick={() => (dismissed = [...dismissed, n.id])}><X class="w-4 h-4" /></button>
								<div class="flex items-start gap-3">
									<span class="w-10 h-10 rounded-xl bg-surface-container-high border border-surface-glass-border flex items-center justify-center shrink-0"><Icon class="w-5 h-5 text-primary" /></span>
									<div class="flex-1 min-w-0">
										<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-badge"><span class="text-on-surface-variant uppercase tracking-wider">{meta.code}</span><span class="text-outline-variant">{meta.source}</span>{#if meta.tag}<span class="text-accent-emerald">· {meta.tag}</span>{/if}</div>
										<h3 class="font-display text-body-md font-bold text-on-surface mt-1">{n.title}</h3>
										<p class="text-body-sm text-on-surface-variant mt-1">{n.body}</p>
										<div class="flex items-center justify-between gap-2 mt-3 flex-wrap">
											{#if meta.action}<a href={meta.action.href} class="h-9 px-3 rounded-lg {meta.action.solid ? 'bg-primary text-on-primary' : 'bg-surface-container-high border border-surface-glass-border text-on-surface'} text-label-badge font-semibold flex items-center">{meta.action.label}</a>{/if}
											<span class="text-label-badge text-on-surface-variant">{deskTime(n)}</span>
										</div>
									</div>
								</div>
							</article>
						{/each}
					</section>
				{:else}
					<EmptyState title="All quiet" sub="New passes, drops and replies will land here.">
						{#snippet icon()}<Bell class="w-6 h-6" />{/snippet}
					</EmptyState>
				{/each}
			</div>
		</div>
	</main>
</div>

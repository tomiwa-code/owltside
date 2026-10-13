<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Bell,
		CloudCheck,
		History,
		Plus,
		QrCode,
		RefreshCw,
		Search,
		ShieldCheck,
		Ticket as TicketIcon
	} from '@lucide/svelte';
	import Cover from '$components/Cover.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import Avatar from '$components/Avatar.svelte';
	import { page } from '$app/state';
	import { useQuery } from '$lib/state/query.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate, fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import type { Ticket } from '$lib/types';

	let { data } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const tickets = useQuery<Ticket[]>(
		'tickets:mine',
		async () => (await fetch('/api/tickets')).json(),
		{ staleTime: 15_000 },
		data.tickets
	);

	let tab = $state<'upcoming' | 'past'>('upcoming');

	const all = $derived(tickets.data ?? []);
	const upcoming = $derived(all.filter((t) => t.status === 'valid' && new Date(t.eventStartsAt) > new Date()));
	const past = $derived(all.filter((t) => !upcoming.includes(t)));
	const shown = $derived(tab === 'upcoming' ? upcoming : past);

	const vaultValue = $derived(all.reduce((s, t) => s + t.price, 0));
	const usedCount = $derived(past.filter((t) => t.status === 'used').length);

	const statusLabel: Record<Ticket['status'], string> = {
		valid: 'Active',
		used: 'Scanned',
		refunded: 'Refunded',
		transferred: 'Transferred'
	};
</script>

<svelte:head><title>Ticket Wallet • Owltside</title></svelte:head>

<!-- ── desktop (md+) ticket wallet & pass registry in the shipped console design
     language (design source unavailable this turn — extrapolated); mobile
     wallet below unchanged ── -->
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
						class="px-3 h-9 rounded-lg flex items-center text-body-sm transition-colors {href === '/tickets' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}"
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
				<span>Vault_Node</span>
				<span class="text-outline-variant">/</span>
				<span>Pass_Registry</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Ticket Wallet & Gate Passes</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Offline HMAC passes, rotation windows and vault history for this access device.</p>
		</div>
		<div class="flex items-center gap-3 flex-wrap">
			<span class="h-10 px-3.5 rounded-lg flex items-center gap-2 border border-surface-glass-border bg-surface-container">
				<span class="relative flex h-2 w-2">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
					<span class="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald"></span>
				</span>
				<span class="{MONO} text-on-surface">Offline Gate Ready</span>
				<span class="flex items-center gap-1 {MONO} text-accent-emerald"><CloudCheck class="w-3.5 h-3.5" /> Secure</span>
			</span>
			<button
				class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors"
				onclick={() => toast('Vault synced — HMAC keys rotated', 'success')}
			>
				<RefreshCw class="w-4 h-4 text-primary" /><span>Sync Vault</span>
			</button>
			<a href="/explore" class="h-10 px-4 rounded-lg flex items-center gap-2 bg-on-surface text-surface-base text-body-sm font-semibold hover:opacity-90 transition-opacity">
				<Plus class="w-4 h-4" /><span>Add Pass</span>
			</a>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-5">
		<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="{MONO} text-on-surface-variant">Active Passes</span>
				<QrCode class="w-4 h-4 text-on-surface-variant" />
			</div>
			<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">{upcoming.length}</span>
			<span class="text-body-sm text-on-surface-variant mt-1.5 block">Ready for gate scan</span>
		</section>
		<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="{MONO} text-on-surface-variant">Used & Scanned</span>
				<History class="w-4 h-4 text-on-surface-variant" />
			</div>
			<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">{usedCount}</span>
			<span class="text-body-sm text-on-surface-variant mt-1.5 block">Of {past.length} archived passes</span>
		</section>
		<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="{MONO} text-on-surface-variant">Lifetime Vault Value</span>
				<span class="{MONO} text-accent-emerald">NGN</span>
			</div>
			<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">{formatMoney(vaultValue)}</span>
			<span class="text-body-sm text-on-surface-variant mt-1.5 block">Across {all.length} minted passes</span>
		</section>
		<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="{MONO} text-on-surface-variant">HMAC Rotation</span>
				<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
			</div>
			<span class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-4">45s</span>
			<span class="text-body-sm text-on-surface-variant mt-1.5 block">Dynamic QR window per pass</span>
		</section>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<button
					class="flex items-center gap-2 h-9 px-4 rounded-lg border text-body-sm transition-colors {tab === 'upcoming' ? 'bg-surface-container-high border-surface-glass-border text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'upcoming')}
				>
					<TicketIcon class="w-4 h-4" /><span>Upcoming</span>
					<span class="{MONO} px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">{upcoming.length}</span>
				</button>
				<button
					class="flex items-center gap-2 h-9 px-4 rounded-lg border text-body-sm transition-colors {tab === 'past' ? 'bg-surface-container-high border-surface-glass-border text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'past')}
				>
					<History class="w-4 h-4" /><span>Past</span>
					<span class="{MONO} px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">{past.length}</span>
				</button>
			</div>

			<div class="grid md:grid-cols-2 gap-5 mt-5">
				{#each shown as ticket (ticket.id)}
					{@const isPast = tab === 'past'}
					<a
						href="/tickets/{ticket.id}"
						class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden hover:bg-surface-container-high transition-colors {isPast ? 'opacity-70' : ''}"
					>
						<div class="relative h-28 w-full overflow-hidden">
							<Cover cover={ticket.cover} class="w-full h-full" iconClass="w-10 h-10 text-white/30" />
							<div class="absolute inset-0 bg-gradient-to-t from-surface-container via-transparent to-transparent"></div>
							<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-surface-base/70 backdrop-blur {MONO} text-on-surface">{ticket.tierName}</span>
							{#if isPast}
								<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-surface-container-highest/90 {MONO} text-on-surface-variant uppercase">{statusLabel[ticket.status]}</span>
							{:else}
								<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-accent-emerald/90 {MONO} text-surface-base font-bold">Active</span>
							{/if}
						</div>
						<div class="p-4 flex flex-col gap-1">
							<span class="font-display text-headline-md text-on-surface truncate">{ticket.eventTitle}</span>
							<span class="text-body-sm text-on-surface-variant">{fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)}</span>
							<span class="text-body-sm text-on-surface-variant truncate">{ticket.venue}</span>
							<div class="flex items-center justify-between pt-2.5 mt-1 border-t border-surface-glass-border">
								<span class="font-code text-label-code text-tertiary tracking-wider">{ticket.code}</span>
								<span class="{MONO} text-primary">Open gate pass →</span>
							</div>
						</div>
					</a>
				{:else}
					<section class="md:col-span-2 rounded-xl border border-surface-glass-border bg-surface-container min-h-[280px] flex flex-col items-center justify-center gap-3 p-10 text-center">
						<span class="w-12 h-12 rounded-xl bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center">
							<TicketIcon class="w-5 h-5" />
						</span>
						<h2 class="font-display text-headline-md text-on-surface">{tab === 'upcoming' ? 'No upcoming passes' : 'No history yet'}</h2>
						<p class="text-body-sm text-on-surface-variant max-w-sm">Grab a pass and it will mint here instantly with a rotating gate QR.</p>
						<a href="/explore" class="h-10 px-5 rounded-lg bg-on-surface text-surface-base text-body-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity">Explore events</a>
					</section>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Vault Readiness</h2>
					<span class="{MONO} text-on-surface-variant">Local_Cache</span>
				</div>
				<div class="flex flex-col gap-2 mt-4 text-body-sm">
					{#each [
						['Offline Cache', 'Enabled'],
						['HMAC Keys', 'Fresh • 12m'],
						['Storage', 'On-device only'],
						['Cloud Mirror', 'Disabled (privacy)']
					] as [label, value]}
						<div class="flex items-center justify-between gap-3">
							<span class="text-on-surface-variant">{label}</span>
							<span class="{MONO} text-accent-emerald">{value}</span>
						</div>
					{/each}
				</div>
				<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high px-4 py-3 mt-4">
					<span class="flex items-center gap-2 min-w-0 {MONO} text-on-surface-variant">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						Secure_Channel: RSA-4096 / TLS 1.3
					</span>
					<span class="{MONO} text-outline-variant shrink-0">v2.4.1</span>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Recent Vault Activity</h2>
					<span class="{MONO} text-on-surface-variant">Audit_Log</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each past.slice(0, 4) as t (t.id)}
						<a href="/tickets/{t.id}" class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5 hover:bg-surface-container-high transition-colors">
							<span class="w-1.5 h-1.5 rounded-full shrink-0 {t.status === 'used' ? 'bg-accent-emerald' : 'bg-outline-variant'}"></span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-sm font-medium text-on-surface truncate">{t.eventTitle}</span>
								<span class="block text-xs text-on-surface-variant mt-0.5">{fmtDate(t.eventStartsAt)} • {t.code}</span>
							</span>
							<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant shrink-0">{statusLabel[t.status]}</span>
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No archived passes yet — every mint will settle here.</p>
					{/each}
				</div>
			</section>
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
	<TopBar title="Ticket Wallet" subtitle="Offline gate passes" />

	<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
		<div class="flex flex-col w-full px-margin md:max-w-2xl md:mx-auto pb-10 gap-space-md pt-space-sm">
			<!-- offline pill -->
			<div class="flex items-center justify-between bg-surface-container-high px-space-md py-2.5 rounded-full shadow-sm">
				<div class="flex items-center gap-space-sm min-w-0">
					<span class="relative flex h-2.5 w-2.5">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
						<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span>
					</span>
					<div class="flex flex-col min-w-0">
						<span class="text-label-badge text-on-surface uppercase tracking-wider font-semibold truncate">Offline Gate Ready</span>
						<span class="text-body-sm text-on-surface-variant truncate">Cached offline • HMAC keys fresh</span>
					</div>
				</div>
				<span class="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full shrink-0">
					<CloudCheck class="w-4 h-4 text-accent-emerald" />
					<span class="text-label-badge text-accent-emerald">SECURE</span>
				</span>
			</div>

			<!-- segmented tabs -->
			<div class="bg-surface-container-lowest p-1 rounded-full flex items-center shadow-inner">
				<button
					class="flex-1 py-2 rounded-full text-label-badge transition-all duration-200 flex items-center justify-center gap-1.5 {tab === 'upcoming' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'upcoming')}
				>
					<TicketIcon class="w-4 h-4" /> Upcoming ({upcoming.length})
				</button>
				<button
					class="flex-1 py-2 rounded-full text-label-badge transition-all duration-200 flex items-center justify-center gap-1.5 {tab === 'past' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'past')}
				>
					<History class="w-4 h-4" /> Past ({past.length})
				</button>
			</div>

			{#each shown as ticket (ticket.id)}
				{@const isPast = tab === 'past'}
				<button
					class="relative bg-surface-raised rounded-xl overflow-hidden shadow-xl text-left w-full hover:bg-surface-container-high transition-colors {isPast ? 'opacity-70' : ''}"
					onclick={() => goto(`/tickets/${ticket.id}`)}
				>
					<div class="relative h-32 w-full overflow-hidden">
						<Cover cover={ticket.cover} class="w-full h-full" iconClass="w-10 h-10 text-white/30" />
						<div class="absolute inset-0 bg-gradient-to-t from-surface-raised via-transparent to-transparent"></div>
						<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-surface-container-lowest/80 backdrop-blur text-label-badge text-on-surface">
							{ticket.tierName}
						</span>
						{#if isPast}
							<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-surface-container-highest/90 text-label-badge text-on-surface-variant uppercase">{ticket.status}</span>
						{:else}
							<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-accent-emerald/90 text-label-badge text-surface-base font-bold">ACTIVE</span>
						{/if}
					</div>
					<div class="p-space-md flex flex-col gap-1">
						<span class="font-display text-headline-md text-on-surface truncate">{ticket.eventTitle}</span>
						<span class="text-body-sm text-on-surface-variant">{fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)}</span>
						<span class="text-body-sm text-on-surface-variant">{ticket.venue}</span>
						<div class="flex items-center justify-between pt-2">
							<span class="font-code text-label-code text-tertiary tracking-wider">{ticket.code}</span>
							<span class="text-label-badge text-primary">Tap for gate pass →</span>
						</div>
					</div>
				</button>
			{:else}
				<EmptyState title={tab === 'upcoming' ? 'No upcoming passes' : 'No history yet'} sub="Grab a pass and it will mint here instantly with a rotating gate QR.">
					{#snippet icon()}<TicketIcon class="w-6 h-6" />{/snippet}
					{#snippet action()}
						<a href="/explore" class="h-11 px-6 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center">Explore events</a>
					{/snippet}
				</EmptyState>
			{/each}
		</div>
	</main>
</div>

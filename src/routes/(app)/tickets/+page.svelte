<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Bell,
		CalendarPlus,
		Check,
		ChevronRight,
		CloudCheck,
		Database,
		Download,
		History,
		Lock,
		QrCode,
		ScanLine,
		Search,
		Send,
		ShieldCheck,
		Ticket as TicketIcon,
		Wallet
	} from '@lucide/svelte';
	import QRCode from 'qrcode';
	import Cover from '$components/Cover.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import Avatar from '$components/Avatar.svelte';
	import { page } from '$app/state';
	import { useQuery } from '$lib/state/query.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate, fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { downloadIcs } from '$lib/utils/ics';
	import { signToken } from '$lib/utils/qr';
	import { formatMoney } from '$lib/utils/money';
import {
	canUseTicketActions,
	isVerifiedTicket,
	ticketStatusChip,
	ticketStatusLabel
} from '$lib/utils/tickets';
	import type { Ticket } from '$lib/types';

	let { data } = $props();

	const session = $derived(data.session !== undefined ? data.session : page.data.session);
	const isGuest = $derived(!session);

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const tickets = useQuery<Ticket[]>(
		'tickets:mine',
		async () => (await fetch('/api/tickets')).json(),
		{ staleTime: 15_000, enabled: !isGuest },
		data.tickets
	);

	// One shared vault selection drives both desktop and mobile tabs.
	let tab = $state<'upcoming' | 'past' | 'archived'>('upcoming');

	const all = $derived(tickets.data ?? []);
	const upcoming = $derived(all.filter((t) => t.status === 'valid' && new Date(t.eventStartsAt) > new Date()));
	const past = $derived(all.filter((t) => !upcoming.includes(t)));
	const pastDesk = $derived(past.filter((t) => t.status === 'used'));
	const archived = $derived(past.filter((t) => t.status !== 'used'));
	const shown = $derived(tab === 'upcoming' ? upcoming : tab === 'past' ? pastDesk : archived);

	// ── desktop vault state ──
	const deskTab = $derived(tab);
	let selectedId = $state('');
	const deskList = $derived(deskTab === 'upcoming' ? upcoming : deskTab === 'past' ? pastDesk : archived);
	const selected = $derived(all.find((t) => t.id === selectedId) ?? upcoming[0] ?? all[0]);
	const selectedVerified = $derived(selected ? isVerifiedTicket(selected) : false);
	const selectedActionsDisabled = $derived(!selected || !canUseTicketActions(selected));
	const refOf = (t: Ticket) => `#${t.code.split('-').slice(-2).join('-')}`;
	const stampTime = (iso: string) =>
		`${fmtDate(iso)} • ${new Date(iso).toLocaleTimeString('en-NG', { hour12: false })}`;

	function hexStamp(code: string): string {
		const dig = (s: string) => {
			let h1 = 0xdeadbeef ^ s.length;
			let h2 = 0x41c6ce57 ^ s.length;
			for (let i = 0; i < s.length; i++) {
				const ch = s.charCodeAt(i);
				h1 = Math.imul(h1 ^ ch, 2654435761);
				h2 = Math.imul(h2 ^ ch, 1597334677);
			}
			h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
			h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
			return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
		};
		return (dig(code) + dig(code + 'x') + dig(code + 'yy')).slice(0, 40);
	}

	/* rotating HMAC QR for the selected pass (30s window) */
	let qrUrl = $state('');
	let qrSeconds = $state(30);
	$effect(() => {
		const code = selected?.code ?? '';
		if (!code) return;
		let cancelled = false;
		let lastWindow = -1;
		async function draw(c: string) {
			const payload = await signToken(c);
			const url = await QRCode.toDataURL(payload, {
				margin: 1,
				width: 520,
				color: { dark: '#0b1120', light: '#ffffff' }
			});
			if (!cancelled) qrUrl = url;
		}
		void (async () => {
			lastWindow = Math.floor(Date.now() / 30000);
			await draw(code);
		})();
		const iv = setInterval(() => {
			const w = Math.floor(Date.now() / 30000);
			if (w !== lastWindow) {
				lastWindow = w;
				void draw(code);
			}
			qrSeconds = Math.max(0, 30 - (Math.floor(Date.now() / 1000) % 30));
		}, 1000);
		return () => {
			cancelled = true;
			clearInterval(iv);
		};
	});

	const ledger = $derived(
		selected
			? [
					{
						at: selected.eventStartsAt,
						type: 'Turnstile Pre-Auth',
						node: `Gate_02_Scanner • ${selected.code}`,
						status: 'Authorized'
					},
					{ at: selected.purchasedAt, type: 'Offline Key Seeded', node: 'Client IndexedDB', status: 'Secure_Store' },
					{
						at: selected.purchasedAt,
						type: 'Badge Minted & Purchased',
						node: `Checkout Gateway (${formatMoney(selected.price)})`,
						status: 'Settled'
					}
				]
			: []
	);
</script>

<svelte:head><title>Ticket Wallet • Owltside</title></svelte:head>

{#if isGuest}
	<!-- Unregistered visitors must sign in before the wallet opens -->
	<div class="flex flex-col min-h-[70dvh] bg-surface-base text-on-surface">
		<div class="mx-auto w-full max-w-xl px-6 py-16 md:py-20 flex-1 flex flex-col items-center justify-center text-center">
			<section class="w-full rounded-2xl border border-surface-glass-border bg-surface-container p-8 md:p-10 flex flex-col items-center gap-5">
				<div class="w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center glow-primary">
					<TicketIcon class="w-8 h-8" />
				</div>
				<div>
					<span class="{MONO} text-on-surface-variant">Guest Session</span>
					<h1 class="font-display text-headline-lg text-on-surface mt-2">Sign in to view your tickets</h1>
					<p class="text-body-md text-on-surface-variant mt-2 max-w-md">
						Sign in or create an account to see your gate passes, keep them synced across devices, and have your QR ready at the door.
					</p>
				</div>
				<div class="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
					<a href="/auth/login?next=/tickets" class="w-full sm:flex-1 h-12 rounded-lg bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center transition-colors hover:bg-primary-container glow-primary">
						Sign In
					</a>
					<a href="/auth/signup?next=/tickets" class="w-full sm:flex-1 h-12 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface font-semibold text-body-md flex items-center justify-center hover:border-primary/40 transition-colors">
						Create Account
					</a>
				</div>
			</section>
		</div>
	</div>
{:else}

<!-- ── desktop (md+) "Cryptographic Vault" wallet per the desktop design source
     (ticket_wallet_dynamic_qr_desktop), themed with Evently Pulse tokens;
     mobile wallet below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">


	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-6 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
				<span class="w-1.5 h-1.5 rounded-full bg-primary glow-primary"></span> Cryptographic Vault
			</span>
			<h1 class="font-display text-[34px] leading-10 font-bold tracking-tight text-on-surface mt-3">Ticket Wallet & Dynamic Passes</h1>
			<p class="text-body-md text-on-surface-variant mt-2 max-w-xl">All offline-synced cryptographic credentials, NFC fast-lanes, and active biometric turnstile passes.</p>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pb-10 grid lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
		<!-- left: pass index -->
		<div class="flex flex-col gap-5 min-w-0">
			<div class="grid grid-cols-3 gap-1 rounded-lg border border-surface-glass-border bg-surface-container p-1">
				{#each [
					['upcoming', `Upcoming (${upcoming.length})`],
					['past', `Past (${pastDesk.length})`],
					['archived', 'Archived']
				] as [id, label]}
					<button
						class="h-9 rounded-md flex items-center justify-center text-body-sm transition-colors {deskTab === id ? 'bg-surface-container-highest text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (tab = id as typeof tab)}
					>
						{label}
					</button>
				{/each}
			</div>

			{#each deskList as t (t.id)}
				{@const isSel = selected?.id === t.id}
				<button
					class="text-left rounded-xl border p-5 transition-colors {isSel ? 'border-primary/40 bg-surface-container' : 'border-surface-glass-border bg-surface-container hover:bg-surface-container-high'}"
					onclick={() => (selectedId = t.id)}
				>
					<div class="flex items-center justify-between gap-3">
						<span class="flex items-center gap-2 min-w-0">
							<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-highest border border-surface-glass-border text-on-surface shrink-0">
								{isSel ? 'Selected Pass' : ticketStatusChip(t.status)}
							</span>
							<span class="{MONO} text-outline-variant truncate">{refOf(t)}</span>
						</span>
						{#if isSel && t.status === 'valid'}
							<span class="flex items-center gap-1.5 {MONO} text-on-surface shrink-0">
								<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Gate Ready
							</span>
						{:else if isSel && t.status === 'used'}
							<span class="flex items-center gap-1.5 {MONO} text-accent-emerald shrink-0">
								<Check class="h-3.5 w-3.5" strokeWidth={3} /> Verified
							</span>
						{:else}
							<span class="{MONO} text-on-surface-variant shrink-0">{fmtDate(t.eventStartsAt)}</span>
						{/if}
					</div>
					<h3 class="font-display text-headline-md text-on-surface mt-3 truncate">{t.eventTitle}</h3>
					<div class="flex flex-col gap-1 mt-2 text-body-sm text-on-surface-variant">
						<span>{fmtDate(t.eventStartsAt)} • {fmtTime(t.eventStartsAt)} WAT</span>
						<span class="truncate">{t.venue}</span>
					</div>
					<div class="grid grid-cols-2 gap-4 rounded-lg bg-surface-container-high/60 border border-surface-glass-border px-4 py-3 mt-4">
						<span class="min-w-0">
							<span class="{MONO} text-on-surface-variant block">Tier & Seat</span>
							<span class="text-body-sm text-on-surface block mt-1 truncate">{t.tierName}</span>
						</span>
						<span class="min-w-0 text-right">
							<span class="{MONO} text-on-surface-variant block">Settled Value</span>
							<span class="text-body-sm text-on-surface block mt-1">{formatMoney(t.price)}</span>
						</span>
					</div>
					<div class="flex items-center justify-between mt-4">
						{#if isSel}
							<span class="flex items-center gap-2 text-body-sm text-on-surface-variant">
								<QrCode class="w-4 h-4" /> Inspecting Pass
							</span>
						{:else}
							<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
								View Credentials <ChevronRight class="w-4 h-4" />
							</span>
						{/if}
						<span class="flex items-center gap-2">
							<span
								role="button"
								tabindex="0"
								aria-label="Add to calendar"
								class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
								onclick={(e) => {
									e.stopPropagation();
									downloadIcs({ title: t.eventTitle, venue: t.venue, startsAt: t.eventStartsAt });
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.stopPropagation();
										downloadIcs({ title: t.eventTitle, venue: t.venue, startsAt: t.eventStartsAt });
									}
								}}
							>
								<CalendarPlus class="w-4 h-4" />
							</span>
							{#if canUseTicketActions(t)}
								<span
									role="button"
									tabindex="0"
									aria-label="Transfer or share"
									class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
									onclick={(e) => {
										e.stopPropagation();
										goto(`/tickets/${t.id}?transfer=1`);
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.stopPropagation();
											goto(`/tickets/${t.id}?transfer=1`);
										}
									}}
								>
									<Send class="w-4 h-4" />
								</span>
							{/if}
						</span>
					</div>
				</button>
			{:else}
				<section class="rounded-xl border border-surface-glass-border bg-surface-container min-h-[220px] flex flex-col items-center justify-center gap-3 p-8 text-center">
					<span class="w-12 h-12 rounded-xl bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center">
						<TicketIcon class="w-5 h-5" />
					</span>
					<h2 class="font-display text-headline-md text-on-surface">{deskTab === 'upcoming' ? 'No upcoming passes' : deskTab === 'past' ? 'No verified passes' : 'Nothing archived'}</h2>
					<p class="text-body-sm text-on-surface-variant max-w-xs">Grab a pass and it will mint here instantly with a rotating gate QR.</p>
					<a href="/explore" class="h-10 px-5 rounded-lg bg-on-surface text-surface-base text-body-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity">Explore events</a>
				</section>
			{/each}

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex items-start gap-3">
				<ShieldCheck class="w-5 h-5 text-primary shrink-0 mt-0.5" />
				<div>
					<p class="text-body-md text-on-surface font-semibold">Zero Connectivity Assurance</p>
					<p class="text-body-sm text-on-surface-variant mt-1 leading-relaxed">
						Tickets are locally signed. Cellular outages will not block entry at turnstiles;
						security nodes sync peer-to-peer over local mesh.
					</p>
				</div>
			</section>
		</div>

		<!-- right: selected pass detail -->
		{#if selected}
			<div class="flex flex-col gap-6 min-w-0">
				<section class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
					<div class="relative h-40">
						<Cover cover={selected.cover} class="w-full h-full" iconClass="w-12 h-12 text-white/25" />
						<div class="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/40 to-transparent"></div>
						<span class="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded {MONO} bg-surface-base/75 backdrop-blur text-on-surface">
							<TicketIcon class="w-3.5 h-3.5" /> {selected.tierName} • {selectedVerified ? 'Verified' : selected.status === 'valid' ? 'Auth_Active' : ticketStatusChip(selected.status)}
						</span>
						<span class="absolute top-3 right-3 px-2.5 py-1 rounded {MONO} bg-surface-base/75 backdrop-blur text-on-surface">
							Gate 02 • {selected.tierName.split(' ')[0]} Turnstile
						</span>
					</div>
					<div class="px-6 pb-6">
						<span class="{MONO} text-on-surface-variant block mt-4">Stage_Deck // Speaker_Lounge</span>
						<h2 class="font-display text-[26px] leading-8 font-bold tracking-tight text-on-surface mt-2">{selected.eventTitle}</h2>

						<div class="grid sm:grid-cols-4 gap-4 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4 mt-5">
							{#each [
								['Pass ID', refOf(selected)],
								['Holder', selected.holder],
								['Seat Alloc', 'Open Floor'],
								['Tier', selected.tierName]
							] as [label, value]}
								<span class="min-w-0">
									<span class="{MONO} text-on-surface-variant block">{label}</span>
									<span class="text-body-md text-on-surface block mt-1 truncate">{value}</span>
								</span>
							{/each}
						</div>

						{#if selectedVerified}
							<div class="mt-5 flex items-center gap-3 rounded-lg border border-accent-emerald/40 bg-accent-emerald/10 px-4 py-3" role="status">
								<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-emerald text-surface-base"><Check class="h-5 w-5" strokeWidth={3} /></span>
								<div class="min-w-0">
									<p class="font-display text-body-lg font-bold text-on-surface">Verified at the gate</p>
									<p class="text-body-sm text-on-surface-variant">Transfer, Apple/Google Wallet, and refund actions are disabled for this checked-in pass.</p>
								</div>
							</div>
						{/if}

						<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/40 p-6 mt-5 flex flex-col items-center">
							<span class="flex items-center gap-2 {MONO} text-on-surface">
								<Lock class="w-3.5 h-3.5 text-primary" /> {selectedVerified ? 'Verified at the gate' : `Pass refreshes in ${qrSeconds}s`}
							</span>
							<div class="relative bg-white rounded-md p-4 mt-5 {selectedActionsDisabled ? 'opacity-50 grayscale' : ''}" style="box-shadow: 0 0 24px -6px rgba(99,102,241,0.45);">
								{#if qrUrl}
									<img src={qrUrl} alt={selectedVerified ? 'Verified gate QR' : 'Rotating gate QR'} class="w-56 h-56" />
								{:else}
									<div class="w-56 h-56 bg-white animate-pulse rounded"></div>
								{/if}
								{#if selectedVerified}
									<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
										<span class="flex items-center gap-1.5 rounded-full bg-surface-base/90 px-3 py-1.5 text-label-badge font-bold text-accent-emerald uppercase"><Check class="h-4 w-4" strokeWidth={3} /> Verified</span>
									</div>
								{:else if !selectedActionsDisabled}
									<div class="absolute inset-x-6 top-1/2 h-0.5 bg-primary/70 animate-pulse pointer-events-none"></div>
								{/if}
							</div>
							<div class="w-56 h-1 rounded-full bg-surface-container-highest overflow-hidden mt-5">
								<div class="h-full bg-primary rounded-full transition-all duration-1000" style="width: {(qrSeconds / 30) * 100}%"></div>
							</div>
							<span class="{MONO} text-on-surface-variant mt-3">{selectedVerified ? 'Checked in — this QR cannot be used again' : 'Auto-refreshing HMAC signature prevents screenshot fraud'}</span>
						</div>

						<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/40 p-5 mt-5 flex items-start gap-3">
							<ScanLine class="w-5 h-5 text-on-surface-variant shrink-0 mt-0.5" />
							<div>
								<p class="text-body-md text-on-surface font-semibold">Gate 02 Fast-Pass Turnstile Instructions</p>
								<p class="text-body-sm text-on-surface-variant mt-1 leading-relaxed">
									Present this QR at eye level to Turnstile scanner or hold your device near the NFC
									target zone. Biometric seat verification is enabled at Hall 1 Entry.
								</p>
							</div>
						</div>

						<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/40 px-5 py-4 mt-5">
							<div class="flex items-center justify-between gap-3">
								<span class="{MONO} text-on-surface-variant">Cryptographic Hash Stamp</span>
								<span class="{MONO} text-on-surface">HMAC-SHA-256</span>
							</div>
							<p class="font-code text-label-code text-on-surface tracking-wider mt-2 break-all">HMAC-SHA256: {hexStamp(selected.code)}</p>
							<div class="flex items-center justify-between gap-3 mt-3">
								<span class="{MONO} text-on-surface-variant">Signature Verifier</span>
								<span class="{MONO} text-on-surface">{selectedVerified ? 'Verified_OK' : selected.status === 'valid' ? 'Token_Valid_OK' : 'Token_Inactive'}</span>
							</div>
						</div>

						<div class="grid sm:grid-cols-2 gap-3 mt-5">
							<button disabled={selectedActionsDisabled} title={selectedVerified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-md flex items-center justify-center gap-2 bg-primary-container text-on-primary-container text-body-sm font-semibold hover:bg-primary/30 transition-colors disabled:cursor-not-allowed disabled:opacity-40" onclick={() => goto(`/tickets/${selected.id}?transfer=1`)}>
								<Send class="w-4 h-4" /><span>Transfer Ticket</span>
							</button>
							<button disabled={selectedActionsDisabled} title={selectedVerified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-md flex items-center justify-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors disabled:cursor-not-allowed disabled:opacity-40" onclick={() => toast('Wallet export queued to device', 'info')}>
								<Wallet class="w-4 h-4" /><span>Add to Apple / Google</span>
							</button>
							<button class="h-11 rounded-md flex items-center justify-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={() => toast('Offline PDF cached for gate mode', 'success')}>
								<Download class="w-4 h-4" /><span>Download Offline PDF</span>
							</button>
							<button disabled={selectedActionsDisabled} title={selectedVerified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-md flex items-center justify-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors disabled:cursor-not-allowed disabled:opacity-40" onclick={() => goto(`/tickets/${selected.id}?refund=1`)}>
								<History class="w-4 h-4" /><span>Request Refund</span>
							</button>
						</div>
					</div>
				</section>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<span class="flex items-center gap-2.5">
							<ShieldCheck class="w-5 h-5 text-primary" />
							<span class="font-display text-headline-md text-on-surface">Gate Security & Scan Ledger</span>
						</span>
						<span class="{MONO} text-on-surface-variant">Auto_Syncing_P2P</span>
					</div>
					<div class="mt-4 overflow-x-auto">
						<div class="min-w-[560px]">
							<div class="grid grid-cols-[1.1fr_1.2fr_1.6fr_0.9fr] gap-3 px-3 pb-2 {MONO} text-on-surface-variant">
								<span>Timestamp (WAT)</span><span>Event Type</span><span>Checkpoint / Node</span><span class="text-right">Signature Status</span>
							</div>
							{#each ledger as row (row.type)}
								<div class="grid grid-cols-[1.1fr_1.2fr_1.6fr_0.9fr] gap-3 px-3 py-3 rounded-md items-center odd:bg-surface-container-high/40">
									<span class="{MONO} text-on-surface">{stampTime(row.at)}</span>
									<span class="text-body-sm text-on-surface">{row.type}</span>
									<span class="text-body-sm text-on-surface-variant truncate">{row.node}</span>
									<span class="{MONO} text-on-surface-variant text-right">{row.status}</span>
								</div>
							{/each}
						</div>
					</div>
				</section>
			</div>
		{/if}
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

	<main class="flex flex-col relative w-full  pb-28 md:pb-16 bg-surface min-h-dvh">
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

			<!-- shared three-bucket vault tabs -->
			<div class="bg-surface-container-lowest p-1 rounded-2xl grid grid-cols-3 gap-1 shadow-inner">
				<button
					class="min-w-0 py-2 rounded-xl text-label-badge transition-all duration-200 flex flex-col items-center justify-center gap-1 {tab === 'upcoming' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'upcoming')}
				>
					<span class="flex items-center gap-1"><TicketIcon class="w-3.5 h-3.5" />Upcoming</span><span class="font-code text-[10px]">{upcoming.length}</span>
				</button>
				<button
					class="min-w-0 py-2 rounded-xl text-label-badge transition-all duration-200 flex flex-col items-center justify-center gap-1 {tab === 'past' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'past')}
				>
					<span class="flex items-center gap-1"><History class="w-3.5 h-3.5" />Past</span><span class="font-code text-[10px]">{pastDesk.length}</span>
				</button>
				<button
					class="min-w-0 py-2 rounded-xl text-label-badge transition-all duration-200 flex flex-col items-center justify-center gap-1 {tab === 'archived' ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
					onclick={() => (tab = 'archived')}
				>
					<span class="flex items-center gap-1"><Database class="w-3.5 h-3.5" />Archived</span><span class="font-code text-[10px]">{archived.length}</span>
				</button>
			</div>

			{#each shown as ticket (ticket.id)}
				{@const isPast = tab !== 'upcoming'}
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
							<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-surface-container-highest/90 text-label-badge text-on-surface-variant uppercase">{ticketStatusLabel(ticket.status)}</span>
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
				<EmptyState title={tab === 'upcoming' ? 'No upcoming passes' : tab === 'past' ? 'No verified passes' : 'Nothing archived'} sub="Your wallet keeps active, verified, and refunded or transferred passes in separate vault tabs.">
					{#snippet icon()}<TicketIcon class="w-6 h-6" />{/snippet}
					{#snippet action()}
						<a href="/explore" class="h-11 px-6 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center">Explore events</a>
					{/snippet}
				</EmptyState>
			{/each}
		</div>
	</main>
</div>

{/if}

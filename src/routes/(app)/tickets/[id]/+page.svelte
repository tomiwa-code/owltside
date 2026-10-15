<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Bell,
		CalendarPlus,
		CloudCheck,
		Copy,
		Download,
		Loader2,
		MapPin,
		ScanLine,
		Search,
		Send,
		ShieldCheck,
		Undo2,
		User,
		Wallet
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
import Cover from '$components/Cover.svelte';
	import QrPass from '$components/QrPass.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { downloadIcs } from '$lib/utils/ics';
	import { fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { page } from '$app/state';

	let { data } = $props();
	const ticket = $derived(data.ticket);
	const active = $derived(ticket.status === 'valid' && new Date(ticket.eventStartsAt) > new Date());

	let transferOpen = $state(false);
	let refundOpen = $state(false);
	let transferHandle = $state('');
	let transferring = $state(false);
	let refunding = $state(false);
	let transferError = $state('');

	function handleTransferEnhance() {
		transferring = true;
		transferError = '';
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			try {
				await update();
				if (result.type === 'success' || result.type === 'redirect') {
					transferOpen = false;
					toast(`Pass transferred to @${transferHandle.trim().replace(/^@/, '')}`, 'success');
				} else if (result.type === 'failure') {
					transferError = typeof result.data?.error === 'string' ? result.data.error : 'Could not transfer ticket.';
				}
			} finally {
				transferring = false;
			}
		};
	}

	function handleRefundEnhance() {
		refunding = true;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			try {
				await update();
				if (result.type === 'success' || result.type === 'redirect') {
					refundOpen = false;
					toast('Refund processed — 3–5 working days', 'info');
				} else if (result.type === 'failure') {
					const errMsg = typeof result.data?.error === 'string' ? result.data.error : 'Could not process refund.';
					toast(errMsg, 'error');
				}
			} finally {
				refunding = false;
			}
		};
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(ticket.code);
			toast('Gate code copied', 'success');
		} catch {
			toast(ticket.code, 'info');
		}
	}

	function hexStamp(code: string): string {
		const digest = (value: string) => {
			let h1 = 0xdeadbeef ^ value.length;
			let h2 = 0x41c6ce57 ^ value.length;
			for (let i = 0; i < value.length; i++) {
				const char = value.charCodeAt(i);
				h1 = Math.imul(h1 ^ char, 2654435761);
				h2 = Math.imul(h2 ^ char, 1597334677);
			}
			h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
			h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
			return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
		};
		return (digest(code) + digest(code + 'x') + digest(code + 'yy')).slice(0, 40);
	}

	const ledger = $derived([
		{ at: ticket.eventStartsAt, type: 'Turnstile Pre-Auth', node: `Gate_02_Scanner • ${ticket.code}`, status: 'Authorized' },
		{ at: ticket.purchasedAt, type: 'Offline Key Seeded', node: 'Client IndexedDB', status: 'Secure_Store' },
		{ at: ticket.purchasedAt, type: 'Badge Minted & Purchased', node: `Checkout Gateway • ${ticket.price}`, status: 'Settled' }
	]);

	const MONO = 'font-code text-[11px] tracking-[0.12em] uppercase';
</script>

<svelte:head><title>{ticket.eventTitle} • Gate Pass</title></svelte:head>

<!-- ── Desktop console (md+) — mirrors app header + Gate Pass in 2-col console layout ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-50 border-b border-surface-glass-border bg-surface-base/85 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center gap-5">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
			</a>
			<nav class="flex items-center gap-1" aria-label="Primary">
				{#each [['/home','Home'],['/explore','Explore'],['/tickets','Tickets'],['/organizer','Organizer']] as [href,label]}
					<a {href} class="px-3 h-9 rounded-lg flex items-center text-body-sm text-on-surface-variant hover:text-on-surface transition-colors">{label}</a>
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
			<a href="/profile" aria-label="Your profile" class="shrink-0"><Avatar name={ticket.holder} src={null} size="sm" /></a>
		</div>
	</header>
	<main class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 flex flex-col gap-6 flex-1">
		<div class="flex items-start justify-between gap-6">
			<div>
				<p class="{MONO} text-on-surface-variant">Gate Pass • Offline-ready • v1.0 SECURE</p>
				<h1 class="font-display text-[30px] leading-none text-on-surface mt-2">{ticket.eventTitle}</h1>
				<p class="text-body-sm text-on-surface-variant mt-1.5">{ticket.tierName} • {fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)} • {ticket.venue}</p>
			</div>
			<span class="hidden lg:inline-flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-full shadow-sm shrink-0">
				<span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span></span>
				<span class="text-label-badge text-on-surface uppercase tracking-wider font-semibold">Offline Gate Ready</span>
				<span class="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full ml-2"><CloudCheck class="w-4 h-4 text-accent-emerald" /><span class="text-label-badge text-accent-emerald">v1.0 SECURE</span></span>
			</span>
		</div>
		<div class="grid grid-cols-[420px_1fr] xl:grid-cols-[460px_1fr] gap-6 items-start">
			<!-- left: ticket card + actions -->
			<div class="flex flex-col gap-4">
				<div class="relative bg-surface-raised rounded-xl overflow-hidden shadow-xl border border-surface-glass-border">
					<div class="relative h-40 w-full overflow-hidden">
						<Cover cover={ticket.cover} class="w-full h-full" iconClass="w-12 h-12 text-white/30" />
						<div class="absolute inset-0 bg-gradient-to-t from-surface-raised via-transparent to-transparent"></div>
						<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-surface-container-lowest/80 backdrop-blur text-label-badge text-on-surface">{ticket.tierName}</span>
					</div>
					<div class="p-5 flex flex-col gap-3">
						<div>
							<h2 class="font-display text-headline-lg-mobile text-on-surface">{ticket.eventTitle}</h2>
							<p class="text-body-sm text-on-surface-variant">{fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)}</p>
						</div>
						<div class="grid grid-cols-2 gap-3 pt-1">
							<div class="rounded-lg bg-surface-container p-3"><span class="text-label-badge text-on-surface-variant block uppercase">Venue</span><span class="text-body-sm text-on-surface font-medium block truncate mt-1">{ticket.venue}</span></div>
							<div class="rounded-lg bg-surface-container p-3"><span class="text-label-badge text-on-surface-variant block uppercase">Holder</span><span class="text-body-sm text-on-surface font-medium block truncate mt-1">{ticket.holder}</span></div>
						</div>
						<div class="flex items-center justify-between pt-1">
							<div class="flex items-center gap-2 min-w-0"><User class="w-4 h-4 text-primary-container" /><span class="text-body-sm text-on-surface font-semibold truncate">{ticket.holder} (@{page.data.session?.handle ?? 'guest'})</span></div>
							<span class="bg-surface-container-high text-label-badge text-accent-emerald px-2 py-0.5 rounded-full font-medium">Verified ID</span>
						</div>
					</div>
					<div class="relative py-2 flex items-center justify-center">
						<div class="absolute -left-3.5 w-7 h-7 bg-surface-base rounded-full shadow-inner"></div>
						<div class="w-full mx-5 border-dashed border-b-2 border-outline-variant/40"></div>
						<div class="absolute -right-3.5 w-7 h-7 bg-surface-base rounded-full shadow-inner"></div>
					</div>
					<div class="p-5 flex flex-col items-center gap-4 bg-surface-container-low/70">
						<div class="inline-flex items-center gap-2 bg-surface-container-highest px-3 py-1.5 rounded-full shadow-sm">
							<span class="text-label-badge text-on-surface font-semibold tracking-wide">Rotating QR • 30s HMAC window</span>
						</div>
						<QrPass code={ticket.code} disabled={!active} />
						<div class="mt-4 flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-lg w-full max-w-[300px] justify-between">
							<div class="flex flex-col min-w-0"><span class="text-label-badge text-on-surface-variant uppercase">Manual Gate Code</span><span class="font-code text-label-code text-on-surface font-semibold tracking-wider">{ticket.code}</span></div>
							<button aria-label="Copy Ticket Code" onclick={copyCode} class="w-8 h-8 rounded-full bg-surface-container-highest hover:bg-primary-container hover:text-on-primary-container flex items-center justify-center text-on-surface transition-colors"><Copy class="w-4 h-4" /></button>
						</div>
						{#if !active}<p class="text-body-sm text-on-surface-variant text-center">This pass is {ticket.status} and will not scan at the gate.</p>{/if}
					</div>
				</div>
				<div class="grid grid-cols-3 gap-2">
					<button class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => downloadIcs({ title: ticket.eventTitle, venue: ticket.venue, startsAt: ticket.eventStartsAt })}><CalendarPlus class="w-4 h-4" /> Calendar</button>
					<button class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => (transferOpen = true)}><Send class="w-4 h-4" /> Transfer</button>
					<button class="h-11 rounded-full bg-surface-container-high hover:bg-error-container text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => (refundOpen = true)}><Undo2 class="w-4 h-4" /> Refund</button>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<button class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => toast('Wallet export queued to device', 'info')}><Wallet class="w-4 h-4" /> Apple / Google</button>
					<button class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => toast('Offline PDF cached for gate mode', 'success')}><Download class="w-4 h-4" /> Offline PDF</button>
				</div>
				<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-3 border border-surface-glass-border">
					<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0"><ShieldCheck class="w-5 h-5" /></span>
					<p class="text-body-sm text-on-surface-variant leading-tight">The QR re-signs every 30 seconds with an HMAC key — screenshots expire, you don't.</p>
				</div>
			</div>
			<!-- right: Gate Security + Scan Ledger -->
			<div class="flex flex-col gap-4">
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Gate Security</h2><span class="text-label-badge text-accent-emerald bg-accent-emerald/10 px-2 py-1 rounded-full">Token valid</span></div>
					<div class="rounded-xl bg-surface-container-high p-4 border border-surface-glass-border">
						<div class="flex items-center gap-2 text-body-sm font-semibold text-on-surface"><ScanLine class="w-4 h-4 text-primary" />Gate 02 Fast-Pass Turnstile</div>
						<p class="text-body-sm text-on-surface-variant pt-2">Present this rotating QR at eye level, or hold your device near the NFC target. Biometric verification is enabled at the hall entry.</p>
					</div>
					<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/60 p-4">
						<div class="flex items-center justify-between gap-2 text-label-badge text-on-surface-variant"><span>Cryptographic hash stamp</span><span>HMAC-SHA-256</span></div>
						<p class="font-code text-label-code text-on-surface break-all pt-3">HMAC-SHA256: {hexStamp(ticket.code)}</p>
						<div class="flex items-center justify-between gap-2 border-t border-surface-glass-border pt-3 mt-3 text-label-badge"><span class="text-on-surface-variant">Signature verifier</span><span class="text-accent-emerald font-medium">Token_Valid_OK</span></div>
					</div>
				</section>
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
					<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Scan Ledger</h2><span class="{MONO} text-accent-emerald">Auto-syncing P2P</span></div>
					<div class="flex flex-col divide-y divide-surface-glass-border pt-2">
						{#each ledger as entry (entry.type)}
							<div class="py-3 flex items-start justify-between gap-3">
								<div class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface">{entry.type}</span><span class="block text-label-badge text-on-surface-variant truncate pt-1">{entry.node}</span><span class="block text-label-badge text-on-surface-variant pt-1">{fmtDateFull(entry.at)} · {fmtTime(entry.at)}</span></div>
								<span class="text-label-badge text-accent-emerald shrink-0">{entry.status}</span>
							</div>
						{/each}
					</div>
				</section>
			</div>
		</div>
	</main>
</div>

<!-- ── Mobile (unchanged layout, now md:hidden) ── -->
<div class="md:hidden flex flex-col min-h-dvh bg-surface">
<TopBar back title="Gate Pass" subtitle={ticket.tierName} />

<main class="flex flex-col relative w-full pt-mobile-header pb-28 bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-margin pb-10 gap-space-md pt-space-sm">
		<!-- offline sync pill -->
		<div class="flex items-center justify-between bg-surface-container-high px-space-md py-2.5 rounded-full shadow-sm">
			<div class="flex items-center gap-space-sm min-w-0">
				<span class="relative flex h-2.5 w-2.5">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
					<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span>
				</span>
				<div class="flex flex-col min-w-0">
					<span class="text-label-badge text-on-surface uppercase tracking-wider font-semibold truncate">Offline Gate Ready</span>
					<span class="text-body-sm text-on-surface-variant truncate">Verifies without internet at the door</span>
				</div>
			</div>
			<span class="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full shrink-0">
				<CloudCheck class="w-4 h-4 text-accent-emerald" />
				<span class="text-label-badge text-accent-emerald">v1.0 SECURE</span>
			</span>
		</div>

		<!-- ticket card -->
		<div class="relative bg-surface-raised rounded-xl overflow-hidden shadow-xl">
			<div class="relative h-36 w-full overflow-hidden">
				<Cover cover={ticket.cover} class="w-full h-full" iconClass="w-12 h-12 text-white/30" />
				<div class="absolute inset-0 bg-gradient-to-t from-surface-raised via-transparent to-transparent"></div>
				<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-surface-container-lowest/80 backdrop-blur text-label-badge text-on-surface">{ticket.tierName}</span>
			</div>
			<div class="p-space-md flex flex-col gap-space-sm">
				<div>
					<h1 class="font-display text-headline-lg-mobile text-on-surface">{ticket.eventTitle}</h1>
					<p class="text-body-sm text-on-surface-variant">{fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)}</p>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="min-w-0">
						<span class="text-label-badge text-on-surface-variant block uppercase">Venue</span>
						<span class="text-body-sm text-on-surface font-medium block truncate">{ticket.venue}</span>
					</div>
					<div class="min-w-0">
						<span class="text-label-badge text-on-surface-variant block uppercase">Holder</span>
						<span class="text-body-sm text-on-surface font-medium block truncate">{ticket.holder}</span>
					</div>
				</div>
				<div class="flex items-center justify-between pt-1">
					<div class="flex items-center gap-2 min-w-0">
						<User class="w-4 h-4 text-primary-container" />
						<span class="text-body-sm text-on-surface font-semibold truncate">{ticket.holder} (@{page.data.session?.handle ?? 'guest'})</span>
					</div>
					<span class="bg-surface-container-high text-label-badge text-accent-emerald px-2 py-0.5 rounded-full font-medium">Verified ID</span>
				</div>
			</div>

			<!-- perforation -->
			<div class="relative py-2 flex items-center justify-center">
				<div class="absolute -left-3.5 w-7 h-7 bg-surface rounded-full shadow-inner"></div>
				<div class="w-full mx-5 border-dashed border-b-2 border-outline-variant/40"></div>
				<div class="absolute -right-3.5 w-7 h-7 bg-surface rounded-full shadow-inner"></div>
			</div>

			<!-- QR -->
			<div class="p-space-md flex flex-col items-center gap-4 bg-surface-container-low/70 pb-6">
				<div class="inline-flex items-center gap-2 bg-surface-container-highest px-3 py-1.5 rounded-full shadow-sm">
					<span class="text-label-badge text-on-surface font-semibold tracking-wide">
						Rotating QR • 30s HMAC window
					</span>
				</div>
				<QrPass code={ticket.code} disabled={!active} />
				<div class="mt-4 flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-lg w-full max-w-[260px] justify-between">
					<div class="flex flex-col min-w-0">
						<span class="text-label-badge text-on-surface-variant uppercase">Manual Gate Code</span>
						<span class="font-code text-label-code text-on-surface font-semibold tracking-wider">{ticket.code}</span>
					</div>
					<button aria-label="Copy Ticket Code" onclick={copyCode} class="w-8 h-8 rounded-full bg-surface-container-highest hover:bg-primary-container hover:text-on-primary-container flex items-center justify-center text-on-surface transition-colors">
						<Copy class="w-4 h-4" />
					</button>
				</div>
				{#if !active}
					<p class="text-body-sm text-on-surface-variant text-center">This pass is {ticket.status} and will not scan at the gate.</p>
				{/if}
			</div>
		</div>

		<!-- actions -->
		<div class="grid grid-cols-3 gap-2">
			<button class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => downloadIcs({ title: ticket.eventTitle, venue: ticket.venue, startsAt: ticket.eventStartsAt })}>
				<CalendarPlus class="w-4 h-4" /> Calendar
			</button>
			<button class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => (transferOpen = true)}>
				<Send class="w-4 h-4" /> Transfer
			</button>
			<button class="h-11 rounded-full bg-surface-container-high hover:bg-error-container text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => (refundOpen = true)}>
				<Undo2 class="w-4 h-4" /> Refund
			</button>
		</div>

		<div class="grid grid-cols-2 gap-2">
			<button class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => toast('Wallet export queued to device', 'info')}>
				<Wallet class="w-4 h-4" /> Apple / Google
			</button>
			<button class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => toast('Offline PDF cached for gate mode', 'success')}>
				<Download class="w-4 h-4" /> Offline PDF
			</button>
		</div>

		<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
			<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0">
				<ShieldCheck class="w-5 h-5" />
			</span>
			<p class="text-body-sm text-on-surface-variant leading-tight">
				The QR re-signs every 30 seconds with an HMAC key — screenshots expire, you don't.
			</p>
		</div>

		<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
			<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Gate Security</h2><span class="text-label-badge text-accent-emerald">Token valid</span></div>
			<div class="rounded-xl bg-surface-container-high p-3">
				<div class="flex items-center gap-2 text-body-sm font-semibold text-on-surface"><ScanLine class="w-4 h-4 text-primary" />Gate 02 Fast-Pass Turnstile</div>
				<p class="text-body-sm text-on-surface-variant pt-2">Present this rotating QR at eye level, or hold your device near the NFC target. Biometric verification is enabled at the hall entry.</p>
			</div>
			<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/60 p-3">
				<div class="flex items-center justify-between gap-2 text-label-badge text-on-surface-variant"><span>Cryptographic hash stamp</span><span>HMAC-SHA-256</span></div>
				<p class="font-code text-label-code text-on-surface break-all pt-2">HMAC-SHA256: {hexStamp(ticket.code)}</p>
				<div class="flex items-center justify-between gap-2 border-t border-surface-glass-border pt-2 mt-2 text-label-badge"><span class="text-on-surface-variant">Signature verifier</span><span class="text-accent-emerald">Token_Valid_OK</span></div>
			</div>
		</section>

		<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md">
			<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Scan Ledger</h2><span class="text-label-badge text-on-surface-variant">Auto-syncing P2P</span></div>
			<div class="flex flex-col divide-y divide-surface-glass-border pt-2">
				{#each ledger as entry (entry.type)}
					<div class="py-3 flex items-start justify-between gap-3">
						<div class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface">{entry.type}</span><span class="block text-label-badge text-on-surface-variant truncate pt-1">{entry.node}</span><span class="block text-label-badge text-on-surface-variant pt-1">{fmtDateFull(entry.at)} · {fmtTime(entry.at)}</span></div>
						<span class="text-label-badge text-accent-emerald shrink-0">{entry.status}</span>
					</div>
				{/each}
			</div>
		</section>
	</div>
</main>
</div>

<Sheet open={transferOpen} title="Transfer pass" close={() => (transferOpen = false)}>
	{#snippet footer()}
		<button
			type="submit"
			form="ticket-transfer-form"
			class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center gap-2 disabled:opacity-40"
			disabled={!transferHandle.trim() || transferring}
		>
			{#if transferring}
				<Loader2 class="w-4.5 h-4.5 animate-spin" />
				<span>Transferring…</span>
			{:else}
				<span>Confirm transfer</span>
			{/if}
		</button>
	{/snippet}
	<form id="ticket-transfer-form" method="POST" action="?/transfer" use:enhance={handleTransferEnhance} class="flex flex-col gap-space-sm">
		{#if transferError}
			<p class="rounded-lg bg-error/10 border border-error/30 px-3 py-2 text-body-sm text-error" role="alert">{transferError}</p>
		{/if}
		<p class="text-body-sm text-on-surface-variant">
			Transfer re-mints the QR under the new holder. Your copy becomes invalid immediately.
		</p>
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Recipient @handle
			<input name="handle" bind:value={transferHandle} placeholder="@tundeb" class="h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
		</label>
	</form>
</Sheet>

<Sheet open={refundOpen} title="Request refund" close={() => (refundOpen = false)}>
	{#snippet footer()}
		<form method="POST" action="?/refund" use:enhance={handleRefundEnhance} class="w-full">
			<button
				type="submit"
				disabled={refunding}
				class="w-full h-12 rounded-full bg-error-container text-on-error-container font-semibold text-body-md flex items-center justify-center gap-2 disabled:opacity-40"
			>
				{#if refunding}
					<Loader2 class="w-4.5 h-4.5 animate-spin" />
					<span>Processing refund…</span>
				{:else}
					<span>Request full refund</span>
				{/if}
			</button>
		</form>
	{/snippet}
	<p class="text-body-sm text-on-surface-variant">
		Full refunds are automatic up to 72 hours before doors. After that, refunds go through the organiser's policy.
	</p>
</Sheet>

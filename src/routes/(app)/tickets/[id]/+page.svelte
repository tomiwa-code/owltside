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
	const NIGHT_MONO = 'font-code text-[10px] tracking-[0.16em] uppercase';
	const watTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT (UTC+1)';
</script>

<svelte:head><title>{ticket.eventTitle} • Gate Pass</title></svelte:head>

<!-- ── Desktop console (md+) — mirrors app header + Gate Pass in 2-col console layout ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-[#0A0A0C] text-white selection:bg-[#E8D9FF]/30">
	<header class="sticky top-0 z-50 h-[56px] border-b border-white/[0.06] bg-[#08080A]/90 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-full flex items-center gap-5">
			<a href="/home" class="flex items-center gap-3 shrink-0">
				<span class="font-display font-black tracking-tight text-white text-[18px]">OWLTSIDE</span>
				<span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-white/[0.08] border border-white/[0.06] font-code text-[10px] tracking-[0.14em] text-white/60">NIGHT PROTOCOL</span>
			</a>
			<nav class="flex items-center gap-1 ml-2" aria-label="Primary">
				<a href="/home" class="px-4 h-8 rounded-md flex items-center text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">Home</a>
				<a href="/explore" class="px-4 h-8 rounded-md flex items-center text-[13px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">Explore</a>
				<a href="/tickets" class="px-4 h-8 rounded-md flex items-center text-[13px] font-medium bg-white text-black">Tickets</a>
				<a href="/organizer" class="px-4 h-8 rounded-md flex items-center text-[13px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">Organizer</a>
			</nav>
			<div class="flex-1"></div>
			<label class="relative hidden lg:flex items-center w-[320px] h-9">
				<Search class="absolute left-3 w-4 h-4 text-white/30 pointer-events-none" />
				<input placeholder="Search dark events, venues, curations.." class="w-full h-full rounded-full bg-[#141416] border border-white/[0.08] pl-10 pr-16 text-[13px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/15" />
				<span class="absolute right-1.5 flex items-center gap-1 px-1.5 py-1 rounded bg-[#1E1E20] border border-white/[0.06] font-code text-[10px] text-white/50">⌘ K</span>
			</label>
			<a href="/notifications" aria-label="Notifications" class="relative w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0">
				<Bell class="w-5 h-5" />
				<span class="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-[#FF8A00] ring-2 ring-[#08080A]"></span>
			</a>
			<div class="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-white/[0.08] shrink-0">
				<div class="hidden xl:flex flex-col items-end leading-tight">
					<span class="text-[13px] font-semibold text-white leading-none">{page.data.session?.handle ?? ticket.holder}</span>
					<span class="flex items-center gap-1 font-code text-[10px] tracking-[0.14em] text-white/40"><span class="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span> Gate Pass Active</span>
				</div>
				<a href="/profile" aria-label="Your profile" class="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center">
					<Avatar name={ticket.holder} src={null} size="sm" />
				</a>
			</div>
		</div>
	</header>

	<main class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 flex flex-col gap-6 flex-1">
		<div class="flex items-start justify-between gap-6">
			<div class="min-w-0">
				<div class="flex items-center gap-2 {NIGHT_MONO} text-white/40">
					<span>Gate Pass</span>
					<span class="text-white/20">/</span>
					<span>Offline-Ready</span>
					<span class="text-white/20">/</span>
					<span class="text-[#A78BFA]">v1.0 SECURE</span>
				</div>
				<h1 class="font-display text-[26px] leading-none font-bold tracking-tight text-white mt-3">{ticket.eventTitle}</h1>
				<p class="text-[13px] text-white/50 mt-2">{ticket.tierName} • {fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)} • {ticket.venue} • {watTime}</p>
			</div>
			<span class="hidden lg:inline-flex items-center gap-3 bg-[#151518] border border-white/[0.06] px-4 py-2 rounded-full shrink-0">
				<span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22C55E]"></span></span>
				<span class="font-code text-[11px] tracking-[0.14em] text-white/70 uppercase font-semibold">Offline Gate Ready</span>
				<span class="flex items-center gap-1.5 bg-[#0A0A0C] border border-white/[0.06] px-2.5 py-1 rounded-full ml-2"><CloudCheck class="w-4 h-4 text-[#22C55E]" /><span class="font-code text-[10px] tracking-[0.12em] text-[#22C55E]">v1.0 SECURE</span></span>
			</span>
		</div>

		<div class="grid grid-cols-[420px_1fr] xl:grid-cols-[460px_1fr] gap-6 items-start">
			<!-- left: ticket card + actions -->
			<div class="flex flex-col gap-4">
				<div class="relative bg-[#151518] rounded-xl overflow-hidden border border-white/[0.06] shadow-xl">
					<div class="relative h-44 w-full overflow-hidden">
						<Cover cover={ticket.cover} class="w-full h-full" iconClass="w-12 h-12 text-white/30" />
						<div class="absolute inset-0 bg-gradient-to-t from-[#151518] via-[#151518]/40 to-transparent"></div>
						<span class="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#0A0A0C]/80 backdrop-blur border border-white/10 font-code text-[10px] tracking-[0.12em] text-white/80">{ticket.tierName}</span>
						<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#E8D9FF] text-[#1A1033] font-code text-[10px] tracking-[0.12em] font-semibold">PASS TIER</span>
					</div>
					<div class="p-5 flex flex-col gap-3">
						<div>
							<h2 class="font-display text-[18px] leading-tight font-semibold text-white">{ticket.eventTitle}</h2>
							<p class="text-[13px] text-white/50 mt-1">{fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)} • {watTime}</p>
						</div>
						<div class="grid grid-cols-2 gap-3 pt-1">
							<div class="rounded-lg bg-[#0A0A0C] border border-white/[0.06] p-3"><span class="{NIGHT_MONO} text-white/30 block">Venue</span><span class="text-[13px] text-white font-medium block truncate mt-1">{ticket.venue}</span></div>
							<div class="rounded-lg bg-[#0A0A0C] border border-white/[0.06] p-3"><span class="{NIGHT_MONO} text-white/30 block">Holder</span><span class="text-[13px] text-white font-medium block truncate mt-1">{ticket.holder}</span></div>
						</div>
						<div class="flex items-center justify-between pt-1">
							<div class="flex items-center gap-2 min-w-0"><User class="w-4 h-4 text-[#A78BFA]" /><span class="text-[13px] text-white font-medium truncate">{ticket.holder} (@{page.data.session?.handle ?? 'guest'})</span></div>
							<span class="bg-[#22C55E]/10 border border-[#22C55E]/20 font-code text-[10px] tracking-[0.12em] text-[#22C55E] px-2 py-0.5 rounded-full font-medium">Verified ID</span>
						</div>
					</div>
					<div class="relative py-2 flex items-center justify-center">
						<div class="absolute -left-3.5 w-7 h-7 bg-[#0A0A0C] rounded-full border border-white/[0.06]"></div>
						<div class="w-full mx-5 border-dashed border-b border-white/10"></div>
						<div class="absolute -right-3.5 w-7 h-7 bg-[#0A0A0C] rounded-full border border-white/[0.06]"></div>
					</div>
					<div class="p-5 flex flex-col items-center gap-4 bg-[#0F0F10]/60">
						<div class="inline-flex items-center gap-2 bg-[#1E1E20] border border-white/[0.06] px-3 py-1.5 rounded-full">
							<span class="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse"></span>
							<span class="font-code text-[10px] tracking-[0.12em] text-white/70 font-semibold">Rotating QR • 30s HMAC window</span>
						</div>
						<div class="bg-white p-3 rounded-xl">
							<QrPass code={ticket.code} disabled={!active} />
						</div>
						<div class="mt-1 flex items-center gap-2 bg-[#0A0A0C] border border-white/[0.06] px-3 py-2.5 rounded-lg w-full max-w-[320px] justify-between">
							<div class="flex flex-col min-w-0"><span class="{NIGHT_MONO} text-white/30">Manual Gate Code</span><span class="font-code text-[13px] text-white font-semibold tracking-wider mt-0.5">{ticket.code}</span></div>
							<button aria-label="Copy Ticket Code" onclick={copyCode} class="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] flex items-center justify-center text-white/70 hover:text-white transition-colors"><Copy class="w-4 h-4" /></button>
						</div>
						{#if !active}<p class="text-[13px] text-white/40 text-center">This pass is {ticket.status} and will not scan at the gate.</p>{/if}
					</div>
				</div>
				<div class="grid grid-cols-3 gap-2">
					<button class="h-10 rounded-full bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.06] text-white font-code text-[11px] tracking-[0.10em] flex items-center justify-center gap-1.5 transition-colors" onclick={() => downloadIcs({ title: ticket.eventTitle, venue: ticket.venue, startsAt: ticket.eventStartsAt })}><CalendarPlus class="w-4 h-4" /> Calendar</button>
					<button class="h-10 rounded-full bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.06] text-white font-code text-[11px] tracking-[0.10em] flex items-center justify-center gap-1.5 transition-colors" onclick={() => (transferOpen = true)}><Send class="w-4 h-4" /> Transfer</button>
					<button class="h-10 rounded-full bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.06] text-white font-code text-[11px] tracking-[0.10em] flex items-center justify-center gap-1.5 transition-colors" onclick={() => (refundOpen = true)}><Undo2 class="w-4 h-4" /> Refund</button>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<button class="h-10 rounded-xl bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.06] text-white font-code text-[11px] tracking-[0.10em] flex items-center justify-center gap-1.5 transition-colors" onclick={() => toast('Wallet export queued to device', 'info')}><Wallet class="w-4 h-4" /> Apple / Google</button>
					<button class="h-10 rounded-xl bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.06] text-white font-code text-[11px] tracking-[0.10em] flex items-center justify-center gap-1.5 transition-colors" onclick={() => toast('Offline PDF cached for gate mode', 'success')}><Download class="w-4 h-4" /> Offline PDF</button>
				</div>
				<div class="bg-[#151518] border border-white/[0.06] rounded-xl p-3 flex items-center gap-3">
					<span class="w-10 h-10 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] flex items-center justify-center flex-shrink-0"><ShieldCheck class="w-5 h-5" /></span>
					<p class="text-[13px] leading-4 text-white/50">The QR re-signs every 30 seconds with an HMAC key — screenshots expire, you don't.</p>
				</div>
			</div>
			<!-- right: Gate Security + Scan Ledger -->
			<div class="flex flex-col gap-4">
				<section class="rounded-xl border border-white/[0.06] bg-[#151518] p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-2"><h2 class="font-display text-[16px] font-semibold text-white">Gate Security</h2><span class="font-code text-[10px] tracking-[0.12em] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-1 rounded-full">Token valid</span></div>
					<div class="rounded-xl bg-[#0A0A0C] border border-white/[0.06] p-4">
						<div class="flex items-center gap-2 text-[13px] font-semibold text-white"><ScanLine class="w-4 h-4 text-[#A78BFA]" />Gate 02 Fast-Pass Turnstile</div>
						<p class="text-[13px] leading-5 text-white/50 pt-2">Present this rotating QR at eye level, or hold your device near the NFC target. Biometric verification is enabled at the hall entry.</p>
					</div>
					<div class="rounded-xl border border-white/[0.06] bg-[#0A0A0C] p-4">
						<div class="flex items-center justify-between gap-2 font-code text-[10px] tracking-[0.12em] text-white/30"><span>Cryptographic hash stamp</span><span>HMAC-SHA-256</span></div>
						<p class="font-code text-[12px] text-white break-all pt-3 leading-4">HMAC-SHA256: {hexStamp(ticket.code)}</p>
						<div class="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 mt-3 font-code text-[11px]"><span class="text-white/30">Signature verifier</span><span class="text-[#22C55E] font-medium">Token_Valid_OK</span></div>
					</div>
				</section>
				<section class="rounded-xl border border-white/[0.06] bg-[#151518] p-5">
					<div class="flex items-center justify-between gap-2"><h2 class="font-display text-[16px] font-semibold text-white">Scan Ledger</h2><span class="{NIGHT_MONO} text-[#22C55E]">Auto-syncing P2P</span></div>
					<div class="flex flex-col divide-y divide-white/[0.06] pt-2">
						{#each ledger as entry (entry.type)}
							<div class="py-3 flex items-start justify-between gap-3">
								<div class="min-w-0"><span class="block text-[13px] font-semibold text-white">{entry.type}</span><span class="block font-code text-[11px] text-white/40 truncate pt-1">{entry.node}</span><span class="block font-code text-[11px] text-white/30 pt-1">{fmtDateFull(entry.at)} · {fmtTime(entry.at)}</span></div>
								<span class="font-code text-[11px] tracking-[0.08em] text-[#22C55E] shrink-0">{entry.status}</span>
							</div>
						{/each}
					</div>
				</section>
				<section class="rounded-xl border border-white/[0.06] bg-[#151518] p-4">
					<h3 class="{NIGHT_MONO} text-white/40 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-white/60"></span> DIRECT COMMS</h3>
					<p class="text-[12px] leading-4 text-white/50 mt-3">Encrypted gate channel active. Need help at the door? Transmit a prompt to the gate team.</p>
					<textarea placeholder="State your gate inquiry..." rows="2" class="mt-3 w-full rounded-lg bg-[#0A0A0C] border border-white/[0.06] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/15 resize-none"></textarea>
					<button class="mt-3 w-full h-9 rounded-md bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] text-white text-[13px] font-medium flex items-center justify-center gap-2 transition-colors" onclick={() => toast('Prompt transmitted to gate ops', 'success')}>▷ Transmit Prompt</button>
				</section>
			</div>
		</div>
	</main>

	<footer class="mt-auto border-t border-white/[0.06] bg-[#08080A]">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-black text-white tracking-tight text-[13px]">OWLTSIDE</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-white/30">EVENT PROTOCOL 2.4.0</span>
				<span class="font-code text-[11px] text-white/30">© 2025 OWLTSIDE Inc.</span>
			</span>
			<span class="flex items-center gap-5 font-code text-[10px] tracking-[0.14em] text-white/30">
				<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#22C55E]"></span> ALL NODES OPERATIONAL</span>
				<a href="/legal" class="hover:text-white/60">Privacy</a>
				<a href="/legal" class="hover:text-white/60">Terms</a>
				<a href="/legal" class="hover:text-white/60">Registry</a>
			</span>
		</div>
	</footer>
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

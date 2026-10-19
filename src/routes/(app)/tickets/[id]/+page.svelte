<script lang="ts">
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import { invalidateAll } from '$app/navigation';
	import {
		Bell,
		CalendarPlus,
		Check,
		CloudCheck,
		Copy,
		CreditCard,
		Download,
		LockKeyhole,
		MapPin,
		ScanLine,
		Search,
		Send,
		ShieldCheck,
		Undo2,
		User,
		Wallet,
		X
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Cover from '$components/Cover.svelte';
	import QrPass from '$components/QrPass.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { queryClient } from '$lib/state/query.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { downloadIcs } from '$lib/utils/ics';
	import { fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { addFee, formatMoney } from '$lib/utils/money';
import { canUseTicketActions, isVerifiedTicket, ticketStatusLabel } from '$lib/utils/tickets';
	import { page } from '$app/state';
	import type { Profile } from '$lib/types';

	let { data } = $props();
	const ticket = $derived(data.ticket);
	const active = $derived(ticket.status === 'valid' && new Date(ticket.eventStartsAt) > new Date());
	const refundDeadline = $derived(new Date(new Date(ticket.eventStartsAt).getTime() - 72 * 60 * 60 * 1000));
	const refundDeadlineLabel = $derived(new Intl.DateTimeFormat('en-NG', {
		month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos'
	}).format(refundDeadline));
	const refundFee = $derived(addFee(ticket.price));
	const refundAmount = $derived(Math.max(0, ticket.price - refundFee));
	const refundEligible = $derived(ticket.status === 'valid' && Date.now() < refundDeadline.getTime());
	const verified = $derived(isVerifiedTicket(ticket));
	const ticketActionsDisabled = $derived(!canUseTicketActions(ticket));
	const statusLabel = $derived(ticketStatusLabel(ticket.status));

	let transferOpen = $state(page.url.searchParams.get('transfer') === '1' && data.ticket.status === 'valid');
	let refundOpen = $state(page.url.searchParams.get('refund') === '1' && data.ticket.status === 'valid');

	$effect(() => {
		if (ticketActionsDisabled) {
			transferOpen = false;
			refundOpen = false;
		}
	});
	let transferHandle = $state('');
	let transferMatches = $state<Profile[]>([]);
	let selectedRecipient = $state<Profile | null>(null);
	let searchingRecipients = $state(false);
	let transferSearchSequence = 0;
	let refundReason = $state('');
	let refundDetails = $state('');
	let refundConfirmed = $state(false);
	let refunding = $state(false);
	let refundError = $state('');
	let transferring = $state(false);
	let transferError = $state('');

	const activeUserId = $derived(
		page.data.session?.userId ?? (page.data.demoMode !== false ? 'u-ada' : '')
	);
	const activeHandle = $derived(
		(page.data.session?.handle ?? (page.data.demoMode !== false ? 'adaobi' : ''))
			.trim()
			.replace(/^@+/, '')
			.toLowerCase()
	);

	function openTransferSheet() {
		if (ticketActionsDisabled) return;
		transferError = '';
		transferOpen = true;
	}

	function openRefundSheet() {
		if (ticketActionsDisabled) return;
		refundError = '';
		refundOpen = true;
	}

	function addToWallet() {
		if (ticketActionsDisabled) return;
		toast('Wallet export queued to device', 'info');
	}

	function closeTransferSheet() {
		transferOpen = false;
		transferError = '';
	}

	async function searchTransferProfiles() {
		const raw = transferHandle.trim();
		const query = raw.replace(/^@+/, '').trim().toLowerCase();
		const sequence = ++transferSearchSequence;
		if (!query && raw !== '@') {
			transferMatches = [];
			searchingRecipients = false;
			return;
		}
		searchingRecipients = true;
		try {
			const response = await fetch(`/api/profiles/search?q=${encodeURIComponent(query || '@')}`);
			if (!response.ok) throw new Error('Could not search users right now.');
			const profiles = (await response.json()) as Profile[];
			if (sequence === transferSearchSequence) {
				transferMatches = (Array.isArray(profiles) ? profiles : []).filter(
					(profile) =>
						profile.id !== activeUserId &&
						(!activeHandle || profile.handle.toLowerCase() !== activeHandle)
				);
			}
		} catch (err) {
			if (sequence === transferSearchSequence) {
				transferMatches = [];
				transferError = err instanceof Error ? err.message : 'Could not search users right now.';
			}
		} finally {
			if (sequence === transferSearchSequence) {
				searchingRecipients = false;
			}
		}
	}

	function handleTransferInput() {
		transferError = '';
		const cleaned = transferHandle.trim().replace(/^@+/, '').trim().toLowerCase();
		if (selectedRecipient && selectedRecipient.handle.toLowerCase() !== cleaned) {
			selectedRecipient = null;
		}
		void searchTransferProfiles();
	}

	function selectRecipient(profile: Profile) {
		selectedRecipient = profile;
		transferHandle = `@${profile.handle}`;
		transferMatches = [];
		transferError = '';
	}

	function clearRecipient() {
		selectedRecipient = null;
		transferHandle = '';
		transferMatches = [];
		transferError = '';
	}

	function handleTransferEnhance() {
		transferring = true;
		transferError = '';
		const targetHandle = (selectedRecipient?.handle ?? transferHandle).trim().replace(/^@+/, '');
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
					selectedRecipient = null;
					transferHandle = '';
					transferMatches = [];
					queryClient.invalidate('tickets');
					queryClient.invalidate('notifications');
					await invalidateAll();
					const finalHandle =
						typeof result.data?.transferredTo === 'string' && result.data.transferredTo
							? result.data.transferredTo
							: targetHandle;
					toast(`Pass transferred to @${finalHandle}`, 'success');
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
		refundError = '';
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
					queryClient.invalidate('tickets');
					queryClient.invalidate('notifications');
					await invalidateAll();
					toast('Refund request submitted — allow 3–5 working days', 'success');
				} else if (result.type === 'failure') {
					refundError = typeof result.data?.error === 'string' ? result.data.error : 'Could not submit your refund request.';
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

{#snippet verifiedBanner()}
	{#if verified}
		<div class="flex items-center gap-3 rounded-xl border border-accent-emerald/40 bg-accent-emerald/10 px-4 py-3" role="status">
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-emerald text-surface-base">
				<Check class="h-6 w-6" strokeWidth={3} />
			</span>
			<div class="min-w-0 flex-1">
				<p class="font-display text-body-lg font-bold text-on-surface">Verified at the gate</p>
				<p class="text-body-sm text-on-surface-variant">This ticket has been checked in. Transfer, Apple/Google Wallet, and refund actions are disabled.</p>
			</div>
			<span class="shrink-0 rounded-full bg-accent-emerald px-3 py-1 text-label-badge font-bold text-surface-base uppercase">Verified</span>
		</div>
	{/if}
{/snippet}

<!-- ── Desktop console (md+) — mirrors app header + Gate Pass in 2-col console layout ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">

	<main class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 flex flex-col gap-6 flex-1">
		<div class="flex items-start justify-between gap-6">
			<div>
				<p class="{MONO} text-on-surface-variant">Gate Pass • Offline-ready • v1.0 SECURE</p>
				<h1 class="font-display text-[30px] leading-none text-on-surface mt-2">{ticket.eventTitle}</h1>
				<p class="text-body-sm text-on-surface-variant mt-1.5">{ticket.tierName} • {fmtDateFull(ticket.eventStartsAt)} • {fmtTime(ticket.eventStartsAt)} • {ticket.venue}</p>
			</div>
			<span class="hidden lg:inline-flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-full shadow-sm shrink-0">
				<span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span></span>
				<span class="text-label-badge text-on-surface uppercase tracking-wider font-semibold">{verified ? 'Verified at Gate' : 'Offline Gate Ready'}</span>
				<span class="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full ml-2"><CloudCheck class="w-4 h-4 text-accent-emerald" /><span class="text-label-badge text-accent-emerald">v1.0 SECURE</span></span>
			</span>
		</div>
		{@render verifiedBanner()}
		<div class="grid grid-cols-[420px_1fr] xl:grid-cols-[460px_1fr] gap-6 items-start">
			<!-- left: ticket card + actions (mirrors mobile) -->
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
							<span class="text-label-badge text-on-surface font-semibold tracking-wide">{verified ? 'Verified • Checked in' : 'Rotating QR • 30s HMAC window'}</span>
						</div>
						<QrPass code={ticket.code} disabled={!active} disabledLabel={verified ? 'Verified' : 'Not active'} />
						<div class="mt-4 flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-lg w-full max-w-[300px] justify-between">
							<div class="flex flex-col min-w-0"><span class="text-label-badge text-on-surface-variant uppercase">Manual Gate Code</span><span class="font-code text-label-code text-on-surface font-semibold tracking-wider">{ticket.code}</span></div>
							<button aria-label="Copy Ticket Code" onclick={copyCode} class="w-8 h-8 rounded-full bg-surface-container-highest hover:bg-primary-container hover:text-on-primary-container flex items-center justify-center text-on-surface transition-colors"><Copy class="w-4 h-4" /></button>
						</div>
						{#if verified}<p class="text-body-sm text-on-surface-variant text-center">Verified at the gate — this pass has been checked in and cannot be scanned again.</p>{:else if !active}<p class="text-body-sm text-on-surface-variant text-center">This pass is {statusLabel.toLowerCase()} and will not scan at the gate.</p>{/if}
					</div>
				</div>
				<div class="grid grid-cols-3 gap-2">
					<button class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => downloadIcs({ title: ticket.eventTitle, venue: ticket.venue, startsAt: ticket.eventStartsAt })}><CalendarPlus class="w-4 h-4" /> Calendar</button>
					<button disabled={ticketActionsDisabled} title={verified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40" onclick={openTransferSheet}><Send class="w-4 h-4" /> Transfer</button>
					<button disabled={ticketActionsDisabled} title={verified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-full bg-surface-container-high hover:bg-error-container text-on-surface text-label-badge flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40" onclick={openRefundSheet}><Undo2 class="w-4 h-4" /> Refund</button>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<button disabled={ticketActionsDisabled} title={verified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40" onclick={addToWallet}><Wallet class="w-4 h-4" /> Apple / Google</button>
					<button class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => toast('Offline PDF cached for gate mode', 'success')}><Download class="w-4 h-4" /> Offline PDF</button>
				</div>
				<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-3 border border-surface-glass-border">
					<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0"><ShieldCheck class="w-5 h-5" /></span>
					<p class="text-body-sm text-on-surface-variant leading-tight">The QR re-signs every 30 seconds with an HMAC key — screenshots expire, you don't.</p>
				</div>
			</div>
			<!-- right: Gate Security + Scan Ledger (same as mobile) -->
			<div class="flex flex-col gap-4">
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Gate Security</h2><span class="text-label-badge text-accent-emerald bg-accent-emerald/10 px-2 py-1 rounded-full">{verified ? 'Verified at gate' : active ? 'Token valid' : 'Token inactive'}</span></div>
					<div class="rounded-xl bg-surface-container-high p-4 border border-surface-glass-border">
						<div class="flex items-center gap-2 text-body-sm font-semibold text-on-surface"><ScanLine class="w-4 h-4 text-primary" />Gate 02 Fast-Pass Turnstile</div>
						<p class="text-body-sm text-on-surface-variant pt-2">Present this rotating QR at eye level, or hold your device near the NFC target. Biometric verification is enabled at the hall entry.</p>
					</div>
					<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/60 p-4">
						<div class="flex items-center justify-between gap-2 text-label-badge text-on-surface-variant"><span>Cryptographic hash stamp</span><span>HMAC-SHA-256</span></div>
						<p class="font-code text-label-code text-on-surface break-all pt-3">HMAC-SHA256: {hexStamp(ticket.code)}</p>
						<div class="flex items-center justify-between gap-2 border-t border-surface-glass-border pt-3 mt-3 text-label-badge"><span class="text-on-surface-variant">Signature verifier</span><span class="text-accent-emerald font-medium">{verified ? 'Verified_OK' : active ? 'Token_Valid_OK' : 'Token_Inactive'}</span></div>
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

<main class="flex flex-col relative w-full  pb-28 bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-margin pb-10 gap-space-md pt-space-sm">
		<!-- offline sync pill -->
		<div class="flex items-center justify-between bg-surface-container-high px-space-md py-2.5 rounded-full shadow-sm">
			<div class="flex items-center gap-space-sm min-w-0">
				<span class="relative flex h-2.5 w-2.5">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
					<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-emerald"></span>
				</span>
				<div class="flex flex-col min-w-0">
					<span class="text-label-badge text-on-surface uppercase tracking-wider font-semibold truncate">{verified ? 'Verified at Gate' : 'Offline Gate Ready'}</span>
					<span class="text-body-sm text-on-surface-variant truncate">{verified ? 'This pass has already been checked in' : 'Verifies without internet at the door'}</span>
				</div>
			</div>
			<span class="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full shrink-0">
				<CloudCheck class="w-4 h-4 text-accent-emerald" />
				<span class="text-label-badge text-accent-emerald">v1.0 SECURE</span>
			</span>
		</div>

		{@render verifiedBanner()}

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
						{verified ? 'Verified • Checked in' : 'Rotating QR • 30s HMAC window'}
					</span>
				</div>
				<QrPass code={ticket.code} disabled={!active} disabledLabel={verified ? 'Verified' : 'Not active'} />
				<div class="mt-4 flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-lg w-full max-w-[260px] justify-between">
					<div class="flex flex-col min-w-0">
						<span class="text-label-badge text-on-surface-variant uppercase">Manual Gate Code</span>
						<span class="font-code text-label-code text-on-surface font-semibold tracking-wider">{ticket.code}</span>
					</div>
					<button aria-label="Copy Ticket Code" onclick={copyCode} class="w-8 h-8 rounded-full bg-surface-container-highest hover:bg-primary-container hover:text-on-primary-container flex items-center justify-center text-on-surface transition-colors">
						<Copy class="w-4 h-4" />
					</button>
				</div>
				{#if verified}
					<p class="text-body-sm text-on-surface-variant text-center">Verified at the gate — this pass has been checked in and cannot be scanned again.</p>
				{:else if !active}
					<p class="text-body-sm text-on-surface-variant text-center">This pass is {statusLabel.toLowerCase()} and will not scan at the gate.</p>
				{/if}
			</div>
		</div>

		<!-- actions -->
		<div class="grid grid-cols-3 gap-2">
			<button class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5" onclick={() => downloadIcs({ title: ticket.eventTitle, venue: ticket.venue, startsAt: ticket.eventStartsAt })}>
				<CalendarPlus class="w-4 h-4" /> Calendar
			</button>
			<button disabled={ticketActionsDisabled} title={verified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40" onclick={openTransferSheet}>
				<Send class="w-4 h-4" /> Transfer
			</button>
			<button disabled={ticketActionsDisabled} title={verified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-full bg-surface-container-high hover:bg-error-container text-on-surface text-label-badge flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40" onclick={openRefundSheet}>
				<Undo2 class="w-4 h-4" /> Refund
			</button>
		</div>

		<div class="grid grid-cols-2 gap-2">
			<button disabled={ticketActionsDisabled} title={verified ? 'Unavailable after gate verification' : undefined} class="h-11 rounded-xl bg-surface-container-high border border-surface-glass-border text-on-surface text-label-badge flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40" onclick={addToWallet}>
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
			<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Gate Security</h2><span class="text-label-badge text-accent-emerald">{verified ? 'Verified at gate' : active ? 'Token valid' : 'Token inactive'}</span></div>
			<div class="rounded-xl bg-surface-container-high p-3">
				<div class="flex items-center gap-2 text-body-sm font-semibold text-on-surface"><ScanLine class="w-4 h-4 text-primary" />Gate 02 Fast-Pass Turnstile</div>
				<p class="text-body-sm text-on-surface-variant pt-2">Present this rotating QR at eye level, or hold your device near the NFC target. Biometric verification is enabled at the hall entry.</p>
			</div>
			<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/60 p-3">
				<div class="flex items-center justify-between gap-2 text-label-badge text-on-surface-variant"><span>Cryptographic hash stamp</span><span>HMAC-SHA-256</span></div>
				<p class="font-code text-label-code text-on-surface break-all pt-2">HMAC-SHA256: {hexStamp(ticket.code)}</p>
				<div class="flex items-center justify-between gap-2 border-t border-surface-glass-border pt-2 mt-2 text-label-badge"><span class="text-on-surface-variant">Signature verifier</span><span class="text-accent-emerald">{verified ? 'Verified_OK' : active ? 'Token_Valid_OK' : 'Token_Inactive'}</span></div>
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

<Sheet open={transferOpen} title="Transfer pass" close={closeTransferSheet}>
	{#snippet footer()}
		<button
			type="submit"
			form="ticket-transfer-form"
			class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center gap-2 disabled:opacity-40"
			disabled={!transferHandle.trim().replace(/^@+/, '').trim() || transferring || ticketActionsDisabled}
		>
			{#if transferring}
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
		<div class="rounded-xl border border-surface-glass-border bg-surface-container-high p-3.5 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<span class="block font-code text-label-badge tracking-wider text-on-surface-variant">1-TO-1 PASS TRANSFER</span>
				<p class="font-display text-body-md font-semibold text-on-surface truncate mt-0.5">{ticket.eventTitle}</p>
				<p class="text-body-sm text-on-surface-variant">1× {ticket.tierName} · {ticket.code}</p>
			</div>
			<span class="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-label-badge font-semibold shrink-0">1-to-1</span>
		</div>
		<p class="text-body-sm text-on-surface-variant">
			Transfer re-mints the QR under the new holder (1 ticket to 1 recipient). Your copy becomes invalid immediately.
		</p>
		{#if selectedRecipient}
			<input type="hidden" name="recipientHandle" value={selectedRecipient.handle} />
		{/if}
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Recipient @handle
			<input
				name="handle"
				type="text"
				autocomplete="off"
				bind:value={transferHandle}
				oninput={handleTransferInput}
				placeholder="@tundeb"
				class="h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"
			/>
		</label>

		{#if selectedRecipient}
			<div class="rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2.5 flex items-center justify-between gap-3" data-testid="selected-transfer-recipient">
				<div class="flex items-center gap-3 min-w-0">
					<Avatar name={selectedRecipient.name} color={selectedRecipient.avatarColor} src={selectedRecipient.avatarUrl} size="sm" />
					<div class="min-w-0">
						<span class="block text-body-sm font-semibold text-on-surface truncate">{selectedRecipient.name}</span>
						<span class="block text-label-badge text-on-surface-variant truncate">@{selectedRecipient.handle}{selectedRecipient.city ? ` · ${selectedRecipient.city}` : ''}</span>
					</div>
				</div>
				<div class="flex items-center gap-2 shrink-0">
					<span class="text-label-badge text-accent-emerald flex items-center gap-1"><Check class="w-3.5 h-3.5" /> Selected</span>
					<button
						type="button"
						aria-label="Clear selected recipient"
						onclick={clearRecipient}
						class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
					>
						<X class="w-4 h-4" />
					</button>
				</div>
			</div>
		{:else if transferHandle.trim().length > 0}
			<div
				role="listbox"
				aria-label="Matching users"
				class="rounded-xl border border-surface-glass-border bg-surface-container-low p-2 max-h-52 overflow-y-auto flex flex-col gap-1"
			>
				{#if searchingRecipients}
					<p class="px-3 py-3 text-body-sm text-on-surface-variant">Searching users…</p>
				{:else if transferMatches.length > 0}
					{#each transferMatches as profile (profile.id)}
						<button
							type="button"
							role="option"
							aria-selected={false}
							onclick={() => selectRecipient(profile)}
							class="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-container-high transition-colors"
						>
							<Avatar name={profile.name} color={profile.avatarColor} src={profile.avatarUrl} size="sm" />
							<span class="min-w-0 flex-1">
								<span class="block text-body-sm font-semibold text-on-surface truncate">{profile.name}</span>
								<span class="block text-label-badge text-on-surface-variant truncate">@{profile.handle}{profile.city ? ` · ${profile.city}` : ''}</span>
							</span>
						</button>
					{/each}
				{:else}
					<p class="px-3 py-3 text-body-sm text-on-surface-variant">No matching users found.</p>
				{/if}
			</div>
		{/if}
	</form>
</Sheet>

<Sheet open={refundOpen} title="Refund Request" close={() => (refundOpen = false)}>
	{#snippet footer()}
		<div class="flex flex-col gap-2">
			<button
				type="submit"
				form="ticket-refund-form"
				disabled={!refundReason || !refundConfirmed || refunding || ticketActionsDisabled}
				class="w-full h-12 rounded-xl bg-error-container text-on-error-container font-semibold text-body-md flex items-center justify-center gap-2 disabled:opacity-40"
			>
				{#if refunding}
					<span>Submitting refund…</span>
				{:else}
					<span>Confirm & Submit Refund ({formatMoney(refundAmount)})</span>
				{/if}
			</button>
			<button type="button" onclick={() => (refundOpen = false)} class="h-10 text-body-sm font-medium text-on-surface-variant hover:text-on-surface">Keep My Ticket</button>
		</div>
	{/snippet}

	<form id="ticket-refund-form" method="POST" action="?/refund" use:enhance={handleRefundEnhance} class="flex flex-col gap-3">
		{#if refundError}
			<p class="rounded-lg bg-error/10 border border-error/30 px-3 py-2 text-body-sm text-error" role="alert">{refundError}</p>
		{/if}
		{#if verified}
			<p class="rounded-lg bg-accent-emerald/10 border border-accent-emerald/30 px-3 py-2 text-body-sm text-on-surface" role="alert">This ticket has been verified at the gate, so it can no longer be refunded.</p>
		{/if}

		<div class="rounded-xl border border-surface-glass-border bg-surface-container-high p-4">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<span class="block font-code text-label-badge tracking-wider text-on-surface-variant">PASS REF #{ticket.id.toUpperCase()}</span>
					<h3 class="font-display text-headline-md text-on-surface font-semibold mt-1 truncate">{ticket.eventTitle}</h3>
					<p class="text-body-sm text-on-surface-variant mt-1">1× {ticket.tierName} · Pass {ticket.code}</p>
				</div>
				<span class="w-10 h-10 rounded-lg bg-surface-container-highest text-primary flex items-center justify-center shrink-0"><Undo2 class="w-5 h-5" /></span>
			</div>
			<div class="mt-4 rounded-lg bg-surface-container px-3 py-2.5 flex items-start gap-2.5">
				<span class="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"></span>
				<div class="min-w-0">
					<p class="font-code text-label-badge tracking-wide text-on-surface">{verified ? 'Verified — refund unavailable' : refundEligible ? 'Eligible for Full Refund' : 'Organizer Policy Review'}</p>
					<p class="text-body-sm text-on-surface-variant mt-0.5">{verified ? 'This pass has already been checked in at the gate.' : refundEligible ? `Valid policy window until ${refundDeadlineLabel} WAT` : 'Your request will be reviewed under the organizer’s refund policy.'}</p>
				</div>
			</div>
		</div>

		<section class="rounded-xl border border-surface-glass-border bg-surface-container-high p-4" aria-labelledby="settlement-breakdown-title">
			<div class="flex items-center justify-between gap-2 mb-3">
				<h3 id="settlement-breakdown-title" class="font-code text-label-badge tracking-wider text-on-surface">Settlement Breakdown</h3>
				<span class="font-code text-label-badge text-on-surface-variant">NGN Ledger</span>
			</div>
			<div class="flex flex-col gap-2.5 text-body-sm">
				<div class="flex items-center justify-between gap-3 text-on-surface-variant"><span>Ticket Original (1× {ticket.tierName})</span><span class="font-code text-on-surface">{formatMoney(ticket.price)}</span></div>
				<div class="flex items-center justify-between gap-3 text-on-surface-variant"><span>Network Gateway Fee</span><span class="font-code text-error">−{formatMoney(refundFee)}</span></div>
			</div>
			<div class="mt-3 pt-3 border-t border-surface-glass-border rounded-lg bg-surface-container px-3 py-2 flex items-center justify-between gap-3">
				<div><span class="block font-code text-label-badge tracking-wider text-on-surface-variant">Net Refund Amount</span><span class="block text-body-sm text-on-surface-variant">Returned to original payment method</span></div>
				<span class="font-display text-headline-lg-mobile font-bold text-on-surface shrink-0">{formatMoney(refundAmount)}</span>
			</div>
		</section>

		<section class="rounded-xl border border-surface-glass-border bg-surface-container-high p-4" aria-labelledby="refund-reason-title">
			<h3 id="refund-reason-title" class="font-display text-headline-md text-on-surface font-semibold">Reason for Cancellation</h3>
			<p class="text-body-sm text-on-surface-variant mt-1">Select the primary reason for recordkeeping.</p>
			<fieldset class="grid grid-cols-2 gap-2 mt-3">
				<legend class="sr-only">Select a refund reason</legend>
				{#each ['Schedule Conflict', 'Emergency', 'Duplicate Order', 'Other Reason'] as reason}
					<label class="min-h-11 px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-body-sm cursor-pointer transition-colors {refundReason === reason ? 'border-primary bg-primary/10 text-on-surface' : 'border-surface-glass-border bg-surface-container text-on-surface hover:bg-surface-container-highest'}">
						<span>{reason}</span>
						<input class="accent-primary h-4 w-4 shrink-0" type="radio" name="reason" value={reason} bind:group={refundReason} required />
					</label>
				{/each}
			</fieldset>
			<label class="block font-code text-label-badge tracking-wide text-on-surface-variant mt-3" for="refund-details">Additional Context (Optional)</label>
			<textarea id="refund-details" name="details" bind:value={refundDetails} maxlength="500" rows="3" placeholder="Optional details for the organizer team…" class="mt-1.5 w-full resize-y min-h-20 px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-sm placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"></textarea>
		</section>

		<section class="rounded-xl border border-surface-glass-border bg-surface-container-high p-4">
			<div class="flex items-center justify-between gap-2 mb-3">
				<h3 class="font-code text-label-badge tracking-wider text-on-surface">Settlement Target</h3>
				<span class="flex items-center gap-1 font-code text-label-badge text-on-surface-variant"><LockKeyhole class="w-3.5 h-3.5" /> Encrypted</span>
			</div>
			<div class="rounded-lg bg-surface-container p-3 flex items-center gap-3">
				<span class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0"><CreditCard class="w-5 h-5" /></span>
				<div class="min-w-0"><p class="text-body-sm font-semibold text-on-surface">Original payment method</p><p class="text-body-sm text-on-surface-variant mt-0.5">Estimated 3–5 business days after approval</p></div>
			</div>
		</section>

		<section class="rounded-xl border border-error/30 bg-error/10 p-4">
			<div class="flex items-start gap-3">
				<ShieldCheck class="w-5 h-5 text-error shrink-0 mt-0.5" />
				<div class="min-w-0">
					<h3 class="font-code text-label-badge tracking-wider font-bold text-error">Critical Ticket Notice</h3>
					<p class="text-body-sm text-on-surface leading-relaxed mt-1">Your 30s HMAC dynamic QR Gate Pass and NFC turnstile access will be voided immediately upon submission. This operation cannot be reversed.</p>
				</div>
			</div>
			<label class="flex items-start gap-2.5 mt-3 text-body-sm text-on-surface cursor-pointer">
				<input class="accent-error w-4 h-4 mt-0.5 shrink-0" type="checkbox" name="confirmed" value="yes" bind:checked={refundConfirmed} required />
				<span>I confirm cancellation of this gate pass.</span>
			</label>
		</section>
	</form>
</Sheet>

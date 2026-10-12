<script lang="ts">
	import {
		CalendarPlus,
		CloudCheck,
		Copy,
		MapPin,
		Send,
		ShieldCheck,
		Undo2,
		User
	} from '@lucide/svelte';
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

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(ticket.code);
			toast('Gate code copied', 'success');
		} catch {
			toast(ticket.code, 'info');
		}
	}
</script>

<svelte:head><title>{ticket.eventTitle} • Gate Pass</title></svelte:head>

<TopBar back title="Gate Pass" subtitle={ticket.tierName} />

<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-margin md:max-w-md md:mx-auto pb-10 gap-space-md pt-space-sm">
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

		<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
			<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0">
				<ShieldCheck class="w-5 h-5" />
			</span>
			<p class="text-body-sm text-on-surface-variant leading-tight">
				The QR re-signs every 30 seconds with an HMAC key — screenshots expire, you don't.
			</p>
		</div>
	</div>
</main>

<Sheet open={transferOpen} title="Transfer pass" close={() => (transferOpen = false)}>
	{#snippet footer()}
		<button
			class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md disabled:opacity-40"
			disabled={!transferHandle.trim()}
			onclick={() => {
				transferOpen = false;
				toast(`Pass transferred to @${transferHandle.trim()}`, 'success');
			}}
		>
			Confirm transfer
		</button>
	{/snippet}
	<div class="flex flex-col gap-space-sm">
		<p class="text-body-sm text-on-surface-variant">
			Transfer re-mints the QR under the new holder. Your copy becomes invalid immediately.
		</p>
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Recipient @handle
			<input bind:value={transferHandle} placeholder="@tundeb" class="h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
		</label>
	</div>
</Sheet>

<Sheet open={refundOpen} title="Request refund" close={() => (refundOpen = false)}>
	{#snippet footer()}
		<button
			class="w-full h-12 rounded-full bg-error-container text-on-error-container font-semibold text-body-md"
			onclick={() => {
				refundOpen = false;
				toast('Refund requested — 3–5 working days', 'info');
			}}
		>
			Request full refund
		</button>
	{/snippet}
	<p class="text-body-sm text-on-surface-variant">
		Full refunds are automatic up to 72 hours before doors. After that, refunds go through the organiser's policy.
	</p>
</Sheet>

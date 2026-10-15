<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ArrowRight,
		BadgeCheck,
		CircleCheck,
		Clock,
		CreditCard,
		Info,
		Loader2,
		Lock,
		MapPin,
		QrCode,
		ScanLine,
		Search,
		ShieldCheck,
		Tag,
		Timer,
		User,
		AtSign,
		Hourglass,
		XCircle
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Cover from '$components/Cover.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { formatMoney } from '$lib/utils/money';
	import { fmtDate } from '$lib/utils/dates';

	let { data } = $props();
	const event = $derived(data.event);

	let tierId = $state(data.tierId);
	let qty = $state(data.qty);
	let promoInput = $state('');
	let appliedPromo = $state<string | null>(data.promo ?? null);
	let paystackReference = $state('');
	let submitting = $state(false);

	let modal = $state<null | 'verifying' | 'declined'>(null);

	const tier = $derived(event.tiers.find((t) => t.id === tierId)!);
	const base = $derived(tier.price * qty);
	const fee = $derived(base > 0 ? Math.min(Math.round(base * 0.015), 1000) : 0);
	const discount = $derived.by(() => {
		if (!appliedPromo) return 0;
		if (appliedPromo === 'TECHCOMMUNITY') return Math.min(5000, base);
		if (appliedPromo === 'OWL10') return Math.round(base * 0.1);
		return 0;
	});
	const total = $derived(Math.max(0, base + fee - discount));

	// reservation countdown 10:00
	let secondsLeft = $state(600);
	$effect(() => {
		const iv = setInterval(() => (secondsLeft = Math.max(0, secondsLeft - 1)), 1000);
		return () => clearInterval(iv);
	});
	const timerLabel = $derived(
		`${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
	);

	function applyPromo() {
		const code = promoInput.trim().toUpperCase();
		if (code === 'TECHCOMMUNITY' || code === 'OWL10') {
			appliedPromo = code;
			toast(`Promo ${code} applied`, 'success');
		} else {
			toast('That code isn\u2019t valid', 'error');
		}
	}

	let formEl: HTMLFormElement | undefined;
	let formElDesktop: HTMLFormElement | undefined;

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';
	const orderId = $derived(
		`ORD-${([...event.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 9000) + 1000}-NG`
	);

	type PaystackPopInstance = {
		setup: (opts: {
			key: string;
			email: string;
			amount: number;
			currency?: string;
			ref?: string;
			metadata?: Record<string, unknown>;
			callback?: (response: { reference?: string }) => void;
			onClose?: () => void;
		}) => { openIframe: () => void };
	};

	function ensurePaystackInline(): Promise<PaystackPopInstance | null> {
		if (typeof window === 'undefined') return Promise.resolve(null);
		const existing = (window as unknown as { PaystackPop?: PaystackPopInstance }).PaystackPop;
		if (existing) return Promise.resolve(existing);
		return new Promise((resolve) => {
			const script = document.createElement('script');
			script.src = 'https://js.paystack.co/v1/inline.js';
			script.async = true;
			script.onload = () => {
				resolve((window as unknown as { PaystackPop?: PaystackPopInstance }).PaystackPop ?? null);
			};
			script.onerror = () => resolve(null);
			document.head.appendChild(script);
		});
	}

	async function onPay() {
		if (submitting) return;
		if (!data.demoMode && !data.holder?.authenticated) {
			toast('Please sign in to complete your ticket purchase.', 'info');
			goto('/auth/login');
			return;
		}

		// Open Paystack Inline Popup when a Paystack public key is configured and total > 0
		if (total > 0 && data.paystackPublicKey) {
			submitting = true;
			const pop = await ensurePaystackInline();
			if (pop) {
				const reference = `OWT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
				try {
					const handler = pop.setup({
						key: data.paystackPublicKey,
						email: data.holder.email,
						amount: Math.round(total * 100),
						currency: 'NGN',
						ref: reference,
						metadata: {
							custom_fields: [
								{ display_name: 'Event', variable_name: 'event', value: event.title },
								{ display_name: 'Tier', variable_name: 'tier', value: tier.name },
								{ display_name: 'Quantity', variable_name: 'qty', value: String(qty) }
							]
						},
						callback: (response) => {
							paystackReference = response?.reference || reference;
							submitForm();
						},
						onClose: () => {
							submitting = false;
							modal = null;
						}
					});
					handler.openIframe();
					return;
				} catch {
					// Fallback to server-side Paystack initialization
				}
			}
		}

		submitForm();
	}

	function payHandler() {
		submitting = true;
		return async ({
			result,
			update
		}: {
			result: { type: string; status?: number; location?: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'redirect' && result.location) {
				if (/^https?:\/\//i.test(result.location)) {
					window.location.assign(result.location);
					return;
				}
				await update();
				return;
			}
			if (result.type === 'failure') {
				submitting = false;
				modal = 'declined';
				const errMsg =
					typeof result.data?.error === 'string' && result.data.error !== 'declined'
						? result.data.error
						: 'Payment declined by gateway';
				toast(errMsg, 'error');
				return;
			}
			await update();
			submitting = false;
		};
	}

	function submitForm() {
		submitting = true;
		modal = 'verifying';
		setTimeout(() => {
			const desktop = window.matchMedia('(min-width: 768px)').matches;
			(desktop ? formElDesktop : formEl)?.requestSubmit();
		}, 40);
	}
</script>

<svelte:head>
	<title>Checkout • Owltside</title>
	<script src="https://js.paystack.co/v1/inline.js"></script>
</svelte:head>

<!-- ── desktop (md+) "Checkout Node" composition — same design language as the
     desktop home/login, themed with Evently Pulse tokens; mobile below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<!-- top bar -->
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
					['/organizer', 'Organizer'],
					['/settings', 'Settings']
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
			<a href="/explore" class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events or venues</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</a>
			<span class="hidden xl:flex items-center gap-2 h-10 px-3 border border-surface-glass-border rounded-lg">
				<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
				<span class="{MONO} text-on-surface">Node 01 // Sync</span>
			</span>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7F…49B2</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">VERIFIED WALLET</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name={data.holder.name} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10">
		<!-- breadcrumb + header -->
		<nav class="{MONO} text-on-surface-variant flex items-center gap-2 min-w-0" aria-label="Breadcrumb">
			<a href="/home" class="hover:text-on-surface shrink-0">Home</a>
			<span class="text-outline-variant">/</span>
			<a href="/explore" class="hover:text-on-surface shrink-0">Events</a>
			<span class="text-outline-variant">/</span>
			<a href="/events/{event.slug}" class="hover:text-on-surface truncate">{event.title}</a>
			<span class="text-outline-variant">/</span>
			<span class="text-on-surface">Checkout</span>
		</nav>
		<div class="flex flex-wrap items-end justify-between gap-6 pt-4 pb-8 border-b border-surface-glass-border">
			<div class="flex items-center gap-4 min-w-0">
				<h1 class="font-display text-display-hero text-on-surface">Checkout Node</h1>
				<span class="{MONO} bg-surface-container border border-surface-glass-border text-on-surface px-2.5 py-1 rounded mb-2">ID: {orderId}</span>
			</div>
			<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container px-4 py-3 mb-1">
				<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
				<div class="flex flex-col leading-tight">
					<span class="{MONO} text-on-surface font-bold">Secure Settlement Channel</span>
					<span class="text-body-sm text-on-surface-variant pt-0.5">Paystack &amp; Flutterwave Rail • Multi-Mesh Enclave</span>
				</div>
			</div>
		</div>

		<!-- pipeline stepper -->
		<div class="grid md:grid-cols-3 gap-4 pt-8">
			<div class="rounded-lg border border-surface-glass-border bg-surface-container p-4 flex items-center gap-3">
				<span class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0">
					<CircleCheck class="w-4 h-4 text-accent-emerald" />
				</span>
				<div class="min-w-0">
					<span class="{MONO} text-on-surface-variant">Step 01</span>
					<p class="text-body-md text-on-surface font-semibold truncate">Ticket Selection ({tier.name})</p>
				</div>
			</div>
			<div class="rounded-lg border border-surface-glass-border bg-surface-container p-4 flex items-center gap-3">
				<span class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0">
					<CircleCheck class="w-4 h-4 text-accent-emerald" />
				</span>
				<div class="min-w-0">
					<span class="{MONO} text-on-surface-variant">Step 02</span>
					<p class="text-body-md text-on-surface font-semibold truncate">{data.holder.name} ({data.holder.email})</p>
				</div>
			</div>
			<div class="rounded-lg border border-surface-glass-border border-l-2 border-l-primary bg-surface-container-high p-4 flex items-center gap-3">
				<span class="w-8 h-8 rounded-full bg-primary text-on-primary font-code text-label-badge font-bold flex items-center justify-center shrink-0">03</span>
				<div class="min-w-0">
					<span class="{MONO} text-on-surface-variant">Active Pipeline</span>
					<p class="text-body-md text-on-surface font-semibold truncate">Payment Method &amp; Issuance</p>
				</div>
			</div>
		</div>
	</div>

	<!-- main grid -->
	<form
		method="POST"
		action="?/pay"
		bind:this={formElDesktop}
		use:enhance={payHandler}
		class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8 pb-4 grid lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_440px] gap-6 xl:gap-8 items-start"
	>
		<input type="hidden" name="event" value={event.slug} />
		<input type="hidden" name="tier" value={tierId} />
		<input type="hidden" name="qty" value={qty} />
		<input type="hidden" name="promo" value={appliedPromo ?? ''} />
		<input type="hidden" name="paystackReference" value={paystackReference} />

		<!-- left column -->
		<div class="flex flex-col gap-6 min-w-0">
			<!-- holder -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex items-center gap-4">
				<span class="w-11 h-11 rounded-full bg-surface-container-high border border-surface-glass-border text-on-surface flex items-center justify-center shrink-0">
					<ShieldCheck class="w-5 h-5" />
				</span>
				<div class="flex-1 min-w-0">
					<span class="flex items-center gap-2 min-w-0">
						<span class="text-body-lg font-semibold text-on-surface truncate">{data.holder.name}</span>
						<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded shrink-0">{tier.name} Holder</span>
					</span>
					<span class="block text-body-sm text-on-surface-variant truncate pt-0.5">{data.holder.email}</span>
				</div>
				<a href="/settings" class="{MONO} text-on-surface underline underline-offset-4 hover:text-primary shrink-0">Modify</a>
			</div>

			<!-- paystack checkout summary -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container p-6 flex items-start justify-between gap-4">
				<div class="flex items-start gap-4 min-w-0">
					<span class="w-11 h-11 rounded-lg bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center shrink-0">
						<CreditCard class="w-5 h-5" />
					</span>
					<div class="min-w-0">
						<h2 class="font-display text-headline-lg text-on-surface">Paystack Secure Checkout</h2>
						<p class="text-body-sm text-on-surface-variant pt-1 leading-relaxed">
							Choose your preferred payment method (Card, Bank Transfer, USSD, or Apple Pay) directly inside the Paystack popup when you click Complete Payment. All transactions are settled in Nigerian Naira (₦ / NGN).
						</p>
					</div>
				</div>
				<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface px-2.5 py-1 rounded shrink-0">Paystack</span>
			</div>

			<!-- voucher -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-4">
					<span class="{MONO} text-on-surface-variant">Incentive &amp; Access Voucher</span>
					<span class="flex items-center gap-1.5 font-code text-label-badge text-on-surface">
						<BadgeCheck class="w-3.5 h-3.5 text-accent-emerald" /> Verified Sponsor Pool
					</span>
				</div>
				{#if appliedPromo}
					<div class="flex items-center gap-3 pt-4">
						<div class="flex-1 flex items-center gap-3 bg-surface-base border border-surface-glass-border rounded-lg px-4 h-12 min-w-0">
							<Tag class="w-4 h-4 text-primary shrink-0" />
							<span class="font-code text-body-md text-on-surface truncate">{appliedPromo}</span>
							<span class="{MONO} bg-accent-emerald/15 border border-accent-emerald/30 text-accent-emerald px-2 py-0.5 rounded ml-auto shrink-0">-{formatMoney(discount)} Applied</span>
						</div>
						<button type="button" onclick={() => (appliedPromo = null)} class="{MONO} h-12 px-4 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface hover:text-error hover:border-error/40 transition-colors shrink-0">
							Remove
						</button>
					</div>
				{:else}
					<div class="flex items-center gap-3 pt-4">
						<div class="flex-1 flex items-center gap-3 bg-surface-base border border-surface-glass-border rounded-lg px-4 h-12 min-w-0">
							<Tag class="w-4 h-4 text-on-surface-variant shrink-0" />
							<input bind:value={promoInput} placeholder="PROMO CODE" class="w-full bg-transparent font-code text-body-md text-on-surface uppercase placeholder:text-outline-variant focus:outline-none" />
						</div>
						<button type="button" onclick={applyPromo} class="{MONO} h-12 px-4 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary transition-colors shrink-0">
							Apply
						</button>
					</div>
				{/if}
				<p class="text-body-sm text-on-surface-variant pt-3">Community allocations granted via Owltside Lagos node seed pool.</p>
			</div>

			<!-- assurance -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container p-6 flex gap-4">
				<span class="w-11 h-11 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface flex items-center justify-center shrink-0">
					<ShieldCheck class="w-5 h-5 text-primary" />
				</span>
				<div class="min-w-0">
					<h3 class="text-body-lg font-semibold text-on-surface">Zero Scalping &amp; Verified Entry Assurance</h3>
					<p class="text-body-sm text-on-surface-variant leading-relaxed pt-2">
						Tickets issued through OWLTSIDE use dynamic QR codes that refresh every 30 seconds so screenshots and counterfeit passes are blocked at {event.venue} gates.
					</p>
					<div class="flex flex-wrap items-center gap-6 pt-4">
						<span class="flex items-center gap-2 font-code text-label-badge text-on-surface">
							<Clock class="w-3.5 h-3.5 text-on-surface-variant" />
							100% Refund Window: Valid till {fmtDate(event.startsAt, { month: 'short', day: 'numeric', year: 'numeric' })}
						</span>
						<span class="flex items-center gap-2 font-code text-label-badge text-on-surface">
							<Lock class="w-3.5 h-3.5 text-accent-emerald" />
							256-bit Nonce Protection
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- right column -->
		<aside class="flex flex-col gap-6 min-w-0">
			<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
				<div class="p-6 flex flex-col gap-4">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<span class="flex items-center gap-2 min-w-0">
								<span class="{MONO} bg-primary text-on-primary px-2 py-0.5 rounded shrink-0">{event.city} Node</span>
								<span class="{MONO} text-on-surface-variant truncate">{fmtDate(event.startsAt)}</span>
							</span>
							<h2 class="font-display text-headline-lg text-on-surface leading-tight pt-3">{event.title}</h2>
							<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant pt-1 min-w-0">
								<MapPin class="w-3.5 h-3.5 shrink-0" />
								<span class="truncate">{event.venue}, {event.city}</span>
							</span>
						</div>
						<Cover cover={event.cover} class="w-16 h-16 rounded-lg border border-surface-glass-border shrink-0" iconClass="w-7 h-7 text-white/40" />
					</div>

					<div class="flex items-center justify-between gap-3 bg-surface-base border border-surface-glass-border rounded-lg px-4 h-11">
						<span class="flex items-center gap-2 font-code text-label-badge text-on-surface min-w-0">
							<Timer class="w-3.5 h-3.5 text-accent-amber shrink-0" />
							<span class="truncate">Seat reservation locked:</span>
						</span>
						<span class="font-code text-body-md font-bold text-accent-amber shrink-0">{timerLabel}</span>
					</div>

					<div class="flex flex-col gap-3">
						<div>
							<div class="flex items-baseline justify-between gap-3">
								<span class="text-body-md text-on-surface font-semibold">{qty}x {tier.name}</span>
								<span class="font-code text-body-md font-bold text-on-surface">{formatMoney(base)}</span>
							</div>
							<p class="text-body-sm text-on-surface-variant pt-0.5">{tier.benefits ?? 'Verified Digital Gate Pass'}</p>
						</div>
						<div class="flex items-center justify-between gap-3">
							<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
								Protocol &amp; Network Rail Fee <Info class="w-3.5 h-3.5 text-outline-variant" />
							</span>
							<span class="font-code text-body-sm text-on-surface-variant">{formatMoney(fee)}</span>
						</div>
						{#if discount > 0}
							<div class="flex items-center justify-between gap-3">
								<span class="flex items-center gap-2 text-body-sm text-on-surface-variant min-w-0">
									<span class="truncate">Partner Pass Incentive</span>
									<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-tertiary px-2 py-0.5 rounded shrink-0">{appliedPromo}</span>
								</span>
								<span class="font-code text-body-sm font-bold text-accent-emerald">-{formatMoney(discount)}</span>
							</div>
						{/if}
					</div>

					<div class="border-t border-surface-glass-border pt-4 flex items-end justify-between gap-4">
						<div class="min-w-0">
							<span class="{MONO} text-on-surface-variant">Grand Total Settlement</span>
							<p class="text-body-sm text-on-surface-variant pt-1">Denominated in Nigerian Naira (NGN)</p>
						</div>
						<div class="text-right shrink-0">
							<span class="font-display text-[38px] leading-none font-bold text-on-surface">{formatMoney(total)}</span>
							<p class="font-code text-label-badge text-on-surface-variant pt-1">≈ {formatMoney(total, 'USD')} Equiv.</p>
						</div>
					</div>

					<button
						type="button"
						disabled={submitting}
						onclick={onPay}
						class="w-full h-12 rounded-lg bg-primary text-on-primary text-body-lg font-semibold flex items-center justify-center gap-2.5 hover:bg-primary-container transition-colors disabled:opacity-50 glow-primary"
					>
						{#if submitting}
							<Loader2 class="w-4.5 h-4.5 animate-spin" />
							<span>Opening Paystack…</span>
						{:else}
							<Lock class="w-4 h-4" />
							<span>Complete Payment • {formatMoney(total)}</span>
						{/if}
					</button>
					<span class="flex items-center justify-center gap-1.5 text-body-sm text-on-surface-variant">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						Instant pass added directly to your OWLTSIDE wallet after Paystack confirmation
					</span>
				</div>
				<div class="grid grid-cols-3 border-t border-surface-glass-border bg-surface-base">
					<span class="flex flex-col items-center gap-2 py-4 px-2 text-center">
						<Lock class="w-4 h-4 text-on-surface" />
						<span class="{MONO} text-on-surface-variant">256-bit TLS 1.3 Encryption</span>
					</span>
					<span class="flex flex-col items-center gap-2 py-4 px-2 text-center border-x border-surface-glass-border">
						<BadgeCheck class="w-4 h-4 text-on-surface" />
						<span class="{MONO} text-on-surface-variant">PCI-DSS Gateway Level 1</span>
					</span>
					<span class="flex flex-col items-center gap-2 py-4 px-2 text-center">
						<QrCode class="w-4 h-4 text-on-surface" />
						<span class="{MONO} text-on-surface-variant">Instant QR Pass</span>
					</span>
				</div>
			</div>

			<!-- geofence -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
				<div class="flex items-center justify-between gap-4">
					<span class="{MONO} text-on-surface-variant">Venue Geofence Clearance</span>
					<span class="font-code text-label-badge text-on-surface">6.4253° N, 3.4219° E</span>
				</div>
				<div class="relative mt-4 h-40 rounded-lg overflow-hidden border border-surface-glass-border bg-surface-container-low">
					<div
						class="absolute inset-0 opacity-60"
						style="background-image: linear-gradient(rgba(192,193,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(192,193,255,0.07) 1px, transparent 1px), radial-gradient(circle at 70% 30%, rgba(76,215,246,0.12) 0, transparent 45%); background-size: 28px 28px, 28px 28px, 100% 100%;"
					></div>
					<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
						<span class="absolute w-16 h-16 rounded-full border border-primary/30 animate-ping"></span>
						<span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center">
							<MapPin class="w-4 h-4" />
						</span>
					</div>
					<div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-surface-base/85 backdrop-blur-md px-4 py-2.5">
						<span class="text-body-sm text-on-surface font-medium truncate">Turnstile Hall 2 (VIP Access Lane)</span>
						<span class="{MONO} bg-primary text-on-primary px-2 py-0.5 rounded shrink-0">Gate Open</span>
					</div>
				</div>
			</div>
		</aside>
	</form>

	<!-- footer -->
	<footer class="mt-8 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="{MONO} text-on-surface-variant">Prot-v2.4.1</span>
			</span>
			<span class="text-body-sm text-on-surface-variant">© {new Date().getFullYear()} OWLTSIDE Protocol. Engineered for nocturnal creators &amp; urban nodes.</span>
			<span class="flex items-center gap-6">
				{#each ['Status', 'Privacy & Terms', 'Telemetry'] as link}
					<button type="button" onclick={() => toast(`${link} console ships with the organizer suite`, 'info')} class="font-code text-label-badge tracking-[0.08em] text-on-surface-variant hover:text-on-surface transition-colors">
						{link}
					</button>
				{/each}
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">

<header class="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-xl pt-safe md:left-20">
	<div class="h-16 px-gutter md:max-w-2xl md:mx-auto flex items-center gap-space-xs">
		<a href="/events/{event.slug}" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="font-display text-headline-md text-on-surface font-semibold">Checkout</h1>
	</div>
</header>

<main class="flex flex-col relative w-full pt-mobile-header pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-2xl md:mx-auto pb-36">
		<!-- step header -->
		<div class="px-gutter pt-space-xs pb-space-sm flex flex-col gap-space-xs">
			<div class="flex items-center justify-between">
				<span class="text-label-badge text-primary uppercase tracking-widest font-semibold flex items-center gap-1.5">
					<span class="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span> Step 2 of 2: Payment & Security
				</span>
				<span class="flex items-center gap-1 text-on-surface-variant font-code text-label-code">
					<Timer class="w-4 h-4 text-accent-amber" />
					<span class="font-medium text-accent-amber">{timerLabel}</span>
				</span>
			</div>
			<div class="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden flex">
				<div class="w-1/2 h-full bg-primary/40"></div>
				<div class="w-1/2 h-full bg-primary rounded-full"></div>
			</div>
		</div>

		<form
			method="POST"
			action="?/pay"
			bind:this={formEl}
			use:enhance={payHandler}
			class="px-gutter flex flex-col gap-space-md"
		>
			<input type="hidden" name="event" value={event.slug} />
			<input type="hidden" name="tier" value={tierId} />
			<input type="hidden" name="qty" value={qty} />
			<input type="hidden" name="promo" value={appliedPromo ?? ''} />
			<input type="hidden" name="paystackReference" value={paystackReference} />

			<!-- order summary -->
			<div class="bg-surface-container rounded-xl border border-surface-glass-border overflow-hidden relative p-space-md flex flex-col gap-space-sm">
				<div class="flex items-start gap-space-sm">
					<Cover cover={event.cover} class="w-16 h-16 rounded-lg shrink-0 border border-surface-glass-border" iconClass="w-7 h-7 text-white/40" />
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-1.5 mb-1">
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high border border-surface-glass-border text-on-surface-variant text-label-badge">
								<BadgeCheck class="w-3 h-3" /><span>OWLTSIDE Pass</span>
							</span>
						</div>
						<h2 class="font-display text-headline-md text-on-surface truncate leading-tight">{event.title}</h2>
						<p class="text-body-sm text-on-surface-variant mt-0.5">{fmtDate(event.startsAt)}, {event.city} • {event.venue}</p>
					</div>
				</div>

				<div class="p-space-sm bg-surface-container-low rounded-lg border border-surface-glass-border flex items-center justify-between">
					<div class="flex items-center gap-2 min-w-0">
						<span class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center flex-shrink-0">
							<ScanLine class="w-4 h-4" />
						</span>
						<div class="truncate">
							<div class="text-label-badge text-on-surface uppercase">{qty}x {tier.name}</div>
							<div class="font-code text-label-code text-on-surface-variant">Verified Digital Gate Pass</div>
						</div>
					</div>
					<span class="font-display text-headline-md text-on-surface font-semibold">{formatMoney(base)}</span>
				</div>

				<div class="flex flex-col gap-1.5 pt-1">
					<div class="flex justify-between items-center text-body-sm text-on-surface-variant">
						<span>Base Ticket Price</span><span>{formatMoney(base)}</span>
					</div>
					<div class="flex justify-between items-center text-body-sm text-on-surface-variant">
						<span class="flex items-center gap-1">Processing & Gateway Fee <Info class="w-3.5 h-3.5 text-outline" /></span>
						<span>{formatMoney(fee)}</span>
					</div>
					{#if discount > 0}
						<div class="flex justify-between items-center text-body-sm text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 px-2.5 py-1 rounded-lg">
							<span class="flex items-center gap-1">
								<Tag class="w-4 h-4" />
								<span class="font-code text-label-code font-semibold tracking-tight">{appliedPromo}</span>
								<span class="text-[10px] uppercase font-bold px-1 rounded bg-accent-emerald/20">Applied</span>
							</span>
							<span class="font-semibold">-{formatMoney(discount)}</span>
						</div>
					{/if}
				</div>

				<div class="flex gap-2">
					<div class="relative flex-1">
						<Tag class="absolute inset-y-0 left-0 pl-3 my-auto w-4 h-4 pointer-events-none text-on-surface-variant" />
						<input
							bind:value={promoInput}
							placeholder="PROMO CODE"
							class="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-surface-glass-border rounded-lg font-code text-label-code text-on-surface focus:outline-none focus:bg-surface-bright uppercase transition-all"
						/>
					</div>
					<button type="button" onclick={applyPromo} class="px-4 py-2 bg-surface-container-high border border-surface-glass-border hover:bg-surface-bright active:scale-95 text-on-surface text-label-badge rounded-lg transition-transform">
						Apply
					</button>
				</div>

				<div class="pt-2 flex items-center justify-between bg-surface-container-low border border-surface-glass-border p-space-sm rounded-lg">
					<div>
						<span class="text-body-sm text-on-surface-variant block">Total Payable Now (NGN)</span>
						<span class="font-display text-headline-lg-mobile text-on-surface font-bold">{formatMoney(total)}</span>
					</div>
					<span class="text-label-badge text-on-surface-variant bg-surface-container px-2 py-1 rounded border border-surface-glass-border">NGN Only</span>
				</div>
			</div>

			<!-- holder -->
			<div class="bg-surface-container rounded-xl p-space-md border border-surface-glass-border flex flex-col gap-space-sm">
				<div class="flex items-center justify-between">
					<h3 class="font-display text-headline-md text-on-surface flex items-center gap-2"><User class="w-5 h-5 text-on-surface-variant" /> Ticket Holder Details</h3>
					<span class="text-label-badge text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 px-2 py-0.5 rounded-full">Verified ID</span>
				</div>
				<div class="bg-surface-container-low border border-surface-glass-border rounded-lg p-2.5 flex items-center justify-between">
					<div class="flex items-center gap-2.5 min-w-0">
						<User class="w-4.5 h-4.5 text-on-surface-variant" />
						<div class="truncate">
							<p class="text-label-badge text-on-surface-variant">Full Name</p>
							<p class="text-body-md text-on-surface font-medium truncate">{data.holder.name}</p>
						</div>
					</div>
					<CircleCheck class="w-4.5 h-4.5 text-accent-emerald" />
				</div>
				<div class="bg-surface-container-low border border-surface-glass-border rounded-lg p-2.5 flex items-center justify-between">
					<div class="flex items-center gap-2.5 min-w-0">
						<AtSign class="w-4.5 h-4.5 text-on-surface-variant" />
						<div class="truncate">
							<p class="text-label-badge text-on-surface-variant">Confirmation Email</p>
							<p class="text-body-md text-on-surface font-medium truncate">{data.holder.email}</p>
						</div>
					</div>
					<CircleCheck class="w-4.5 h-4.5 text-accent-emerald" />
				</div>
			</div>

			<!-- paystack notice -->
			<div class="bg-surface-container rounded-xl p-space-md border border-surface-glass-border flex items-start gap-3">
				<span class="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
					<CreditCard class="w-5 h-5" />
				</span>
				<div class="flex-1 min-w-0">
					<div class="text-body-md text-on-surface font-semibold flex items-center justify-between gap-2">
						<span>Powered by Paystack</span>
						<span class="text-label-badge text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">NGN</span>
					</div>
					<p class="text-body-sm text-on-surface-variant leading-relaxed mt-1">
						Tap Pay Securely below to open the Paystack popup and pay with Card, Bank Transfer, or USSD.
					</p>
				</div>
			</div>

			<!-- security ribbon -->
			<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
				<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0">
					<ShieldCheck class="w-5.5 h-5.5" />
				</span>
				<div class="flex-1 min-w-0">
					<div class="text-label-badge text-on-surface font-semibold flex items-center gap-1">
						<span>End-to-End Protected Checkout</span><Lock class="w-3.5 h-3.5 text-accent-emerald" />
					</div>
					<p class="text-body-sm text-on-surface-variant leading-tight mt-0.5">
						256-Bit SSL Encrypted • Instant Ticket Delivery to Wallet • 100% Verified
					</p>
				</div>
			</div>
		</form>
	</div>

	<!-- sticky pay dock -->
	<div class="fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl px-gutter py-3 pb-safe border-t border-surface-glass-border md:left-20">
		<div class="max-w-md mx-auto flex items-center gap-3">
			<div class="flex flex-col min-w-0">
				<span class="text-label-badge text-on-surface-variant uppercase">Total</span>
				<span class="font-display text-headline-md text-on-surface font-bold">{formatMoney(total)}</span>
			</div>
			<button
				type="button"
				disabled={submitting}
				class="flex-1 h-12 rounded-full bg-primary-fixed hover:bg-white active:scale-[0.98] disabled:opacity-50 text-surface-base font-semibold flex items-center justify-center gap-2 shadow-md"
				onclick={onPay}
			>
				{#if submitting}
					<Loader2 class="w-4.5 h-4.5 animate-spin" />
					<span>Processing…</span>
				{:else}
					<span>Pay Securely</span>
					<ArrowRight class="w-4.5 h-4.5" />
				{/if}
			</button>
		</div>
	</div>
</main>
</div>

<!-- confirmation modal -->
{#if modal}
	<div class="fixed inset-0 z-[85] bg-surface-base/80 backdrop-blur-md flex items-end sm:items-center justify-center p-gutter">
		<div class="w-full max-w-sm bg-surface-raised rounded-xl p-space-lg shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
			{#if modal === 'verifying'}
				<div class="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-3">
					<Hourglass class="w-8 h-8 text-accent-amber animate-pulse" />
				</div>
				<h3 class="font-display text-headline-md text-on-surface font-bold">Confirming your order…</h3>
				<p class="text-body-md text-on-surface-variant mt-1 mb-4">
					Completing your checkout and adding your ticket pass to your wallet.
				</p>
			{:else}
				<div class="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mb-3">
					<XCircle class="w-8 h-8 text-error" />
				</div>
				<h3 class="font-display text-headline-md text-on-surface font-bold">Payment Not Completed</h3>
				<p class="text-body-md text-on-surface-variant mt-1 mb-4">
					We couldn't confirm this transaction with Paystack. No ticket was charged — please try again.
				</p>
				<button class="w-full py-3 rounded-full bg-surface-container text-on-surface text-label-badge uppercase tracking-wider font-semibold" onclick={() => (modal = null)}>Dismiss</button>
			{/if}
		</div>
	</div>
{/if}

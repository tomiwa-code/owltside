<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		ArrowLeft,
		ArrowRight,
		BadgeCheck,
		CircleCheck,
		CreditCard,
		Info,
		Landmark,
		Lock,
		PieChart,
		ScanLine,
		ShieldCheck,
		Smartphone,
		Tag,
		Timer,
		User,
		AtSign,
		FlaskConical,
		Hourglass,
		XCircle,
		Fingerprint
	} from '@lucide/svelte';
	import Cover from '$components/Cover.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { formatMoney } from '$lib/utils/money';
	import { fmtDate } from '$lib/utils/dates';
	import type { PaymentScenario } from '$lib/types';

	let { data, form } = $props();
	const event = $derived(data.event);

	let tierId = $state(data.tierId);
	let qty = $state(data.qty);
	let promoInput = $state('');
	let appliedPromo = $state<string | null>(null);
	let method = $state<'card' | 'transfer' | 'ussd' | 'split'>('card');
	let scenario = $state<PaymentScenario>('approve');

	let modal = $state<null | 'verifying' | '3ds' | 'declined' | 'success'>(null);

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

	const methods = [
		{ id: 'card', icon: CreditCard, title: 'Debit / Credit Card', sub: 'Visa, Mastercard, Verve via Paystack', tag: 'Fastest' },
		{ id: 'transfer', icon: Landmark, title: 'Direct Bank Transfer', sub: 'Instant virtual account assignment' },
		{ id: 'ussd', icon: Smartphone, title: 'Offline USSD String', sub: 'GTBank (*737#), FirstBank (*894#), Zenith' },
		{ id: 'split', icon: PieChart, title: 'Split Bill / Pay Later', sub: 'Spread across 2 friends or 3 installments' }
	] as const;

	function onPay() {
		if (scenario === '3ds') {
			modal = '3ds';
			return;
		}
		submitForm();
	}

	let formEl: HTMLFormElement | undefined;
	function submitForm() {
		modal = 'verifying';
		// let the modal paint, then submit through enhance
		setTimeout(() => formEl?.requestSubmit(), 60);
	}
</script>

<svelte:head><title>Checkout • Owltside</title></svelte:head>

<header class="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-xl pt-safe md:left-20">
	<div class="h-16 px-gutter md:max-w-2xl md:mx-auto flex items-center gap-space-xs">
		<a href="/events/{event.slug}" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="font-display text-headline-md text-on-surface font-semibold">Checkout</h1>
	</div>
</header>

<main class="flex flex-col relative w-full pt-16 pb-safe bg-surface min-h-dvh">
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
			use:enhance={() => async ({ result }) => {
					if (result.type === 'failure') {
						modal = 'declined';
						if (result.status === 402) toast('Payment declined by gateway', 'error');
					}
				}}
			class="px-gutter flex flex-col gap-space-md"
		>
			<input type="hidden" name="event" value={event.slug} />
			<input type="hidden" name="tier" value={tierId} />
			<input type="hidden" name="qty" value={qty} />
			<input type="hidden" name="promo" value={appliedPromo ?? ''} />
			<input type="hidden" name="method" value={method} />
			<input type="hidden" name="scenario" value={scenario} />

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
							<div class="font-code text-label-code text-on-surface-variant">Rotating HMAC gate pass</div>
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

			<!-- payment methods -->
			<div class="bg-surface-container rounded-xl p-space-md border border-surface-glass-border flex flex-col gap-space-sm">
				<div class="flex items-center justify-between">
					<h3 class="font-display text-headline-md text-on-surface flex items-center gap-2"><Landmark class="w-5 h-5 text-on-surface-variant" /> Payment Method</h3>
					<span class="text-label-badge text-on-surface-variant">4 Options</span>
				</div>
				{#each methods as m (m.id)}
					<label class="cursor-pointer flex items-center justify-between p-3 rounded-lg border border-surface-glass-border transition-all {method === m.id ? 'bg-surface-container-high' : 'bg-surface-container-low'}">
						<span class="flex items-center gap-3">
							<input type="radio" name="methodRadio" checked={method === m.id} onchange={() => (method = m.id)} class="accent-[#c0c1ff] w-4 h-4" />
							<span class="flex flex-col">
								<span class="text-body-md text-on-surface font-semibold flex items-center gap-1.5">
									{m.title}
									{#if 'tag' in m && m.tag}
										<span class="px-1.5 py-0.2 rounded bg-surface-bright text-on-surface text-[10px] font-bold border border-surface-glass-border">{m.tag}</span>
									{/if}
								</span>
								<span class="text-body-sm text-on-surface-variant">{m.sub}</span>
							</span>
						</span>
						<m.icon class="w-5 h-5 text-on-surface-variant" />
					</label>
				{/each}
				{#if method === 'card'}
					<div class="mt-1 p-3 rounded-lg bg-surface-container-low border border-surface-glass-border flex flex-col gap-2">
						<span class="flex items-center gap-2 text-on-surface font-code text-label-code">
							<CreditCard class="w-4.5 h-4.5 text-on-surface-variant" /> Card {data.paystack ? 'charged via Paystack checkout' : 'vault (demo)'}
						</span>
						<div class="flex gap-2">
							<input readonly value="5399 •••• •••• 8820" class="flex-1 bg-surface-container border border-surface-glass-border px-3 py-2 rounded font-code text-label-code text-on-surface focus:outline-none" />
							<input readonly value="09/27" class="w-20 bg-surface-container border border-surface-glass-border px-3 py-2 rounded font-code text-label-code text-on-surface text-center focus:outline-none" />
							<input readonly type="password" value="123" class="w-16 bg-surface-container border border-surface-glass-border px-3 py-2 rounded font-code text-label-code text-on-surface text-center focus:outline-none" />
						</div>
					</div>
				{/if}
			</div>

			<!-- sandbox harness -->
			<div class="bg-surface-raised rounded-xl p-space-md shadow-md flex flex-col gap-space-xs">
				<div class="flex items-center justify-between">
					<span class="flex items-center gap-1.5">
						<FlaskConical class="w-4.5 h-4.5 text-accent-amber" />
						<span class="text-label-badge text-accent-amber uppercase tracking-wider font-semibold">Sandbox Test Harness</span>
					</span>
					<span class="font-code text-[11px] text-on-surface-variant">{data.paystack ? 'Live Paystack' : 'Demo gateway'}</span>
				</div>
				<p class="text-body-sm text-on-surface-variant">Select gateway response simulation to verify client handling:</p>
				<div class="grid grid-cols-3 gap-1.5 p-1 bg-surface-container rounded-lg mt-1">
					{#each [['approve', 'Approve (200)'], ['3ds', 'Require 3DS'], ['decline', 'Decline (402)']] as [id, label]}
						<button
							type="button"
							onclick={() => (scenario = id as PaymentScenario)}
							class="py-1.5 px-2 rounded text-label-badge text-center transition-all {scenario === id ? 'bg-accent-emerald text-surface-container-lowest font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
						>
							{label}
						</button>
					{/each}
				</div>
			</div>

			<!-- security ribbon -->
			<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
				<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0">
					<ShieldCheck class="w-5.5 h-5.5" />
				</span>
				<div class="flex-1 min-w-0">
					<div class="text-label-badge text-on-surface font-semibold flex items-center gap-1">
						<span>End-to-End Dynamic Protection</span><Lock class="w-3.5 h-3.5 text-accent-emerald" />
					</div>
					<p class="text-body-sm text-on-surface-variant leading-tight mt-0.5">
						256-Bit SSL Encrypted • Instant Dynamic HMAC Ticket in Wallet • 100% Verified
					</p>
				</div>
			</div>
		</form>
	</div>

	<!-- sticky pay dock -->
	<div class="fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl px-gutter py-3 border-t border-surface-glass-border md:left-20">
		<div class="max-w-md mx-auto flex items-center gap-3">
			<div class="flex flex-col min-w-0">
				<span class="text-label-badge text-on-surface-variant uppercase">Total</span>
				<span class="font-display text-headline-md text-on-surface font-bold">{formatMoney(total)}</span>
			</div>
			<button class="flex-1 h-12 rounded-full bg-primary-fixed hover:bg-white active:scale-[0.98] text-surface-base font-semibold flex items-center justify-center gap-2 shadow-md" onclick={onPay}>
				<span>Pay Securely</span>
				<ArrowRight class="w-4.5 h-4.5" />
			</button>
		</div>
	</div>
</main>

<!-- simulation modal -->
{#if modal}
	<div class="fixed inset-0 z-[85] bg-surface-base/80 backdrop-blur-md flex items-end sm:items-center justify-center p-gutter">
		<div class="w-full max-w-sm bg-surface-raised rounded-xl p-space-lg shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
			{#if modal === 'verifying'}
				<div class="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-3">
					<Hourglass class="w-8 h-8 text-accent-amber animate-pulse" />
				</div>
				<h3 class="font-display text-headline-md text-on-surface font-bold">Verifying Order...</h3>
				<p class="text-body-md text-on-surface-variant mt-1 mb-4">
					Connecting with the gateway node and issuing cryptographic HMAC keys.
				</p>
			{:else if modal === '3ds'}
				<div class="w-16 h-16 rounded-full bg-tertiary-container flex items-center justify-center mb-3">
					<Fingerprint class="w-8 h-8 text-on-tertiary-container" />
				</div>
				<h3 class="font-display text-headline-md text-on-surface font-bold">3-D Secure Check</h3>
				<p class="text-body-md text-on-surface-variant mt-1 mb-4">
					Your bank app is asking you to approve this payment of {formatMoney(total)}.
				</p>
				<div class="w-full flex gap-2">
					<button class="flex-1 py-3 rounded-full bg-surface-container text-on-surface text-label-badge uppercase tracking-wider font-semibold" onclick={() => (modal = null)}>Cancel</button>
					<button class="flex-1 py-3 rounded-full bg-primary text-on-primary text-label-badge uppercase tracking-wider font-semibold" onclick={() => { modal = 'verifying'; setTimeout(() => formEl?.requestSubmit(), 60); }}>Approve</button>
				</div>
			{:else}
				<div class="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mb-3">
					<XCircle class="w-8 h-8 text-error" />
				</div>
				<h3 class="font-display text-headline-md text-on-surface font-bold">Payment Declined (402)</h3>
				<p class="text-body-md text-on-surface-variant mt-1 mb-4">
					The gateway declined this transaction. No money moved — try another method or scenario.
				</p>
				<button class="w-full py-3 rounded-full bg-surface-container text-on-surface text-label-badge uppercase tracking-wider font-semibold" onclick={() => (modal = null)}>Dismiss</button>
			{/if}
		</div>
	</div>
{/if}

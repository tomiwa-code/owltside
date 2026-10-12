<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		CheckCircle2,
		Camera,
		KeyRound,
		Lock,
		OctagonAlert,
		RadioTower,
		RotateCw,
		ScanLine,
		ShieldCheck,
		Wifi,
		WifiOff,
		Zap
	} from '@lucide/svelte';
	import type { Checkin, OrganizerPayload } from '$lib/types';
	import { fmtRelative } from '$lib/utils/dates';
	import { toast } from '$lib/state/toast.svelte';

	let { data } = $props();

	const events = $derived(data.organizer.events);
	let eventId = $state(events[0]?.id ?? '');
	const event = $derived(events.find((e) => e.id === eventId) ?? events[0]);
	const gate = $derived(event?.gates?.[0]?.name ?? 'Gate 1');

	/* ── phase A: staff PIN ─────────────────────────────────── */
	let phase = $state<'pin' | 'scan'>('pin');
	let digits = $state(['8', '4', '2', '', '', '']);
	let cellRefs: HTMLInputElement[] = [];
	let countdown = $state(299); // 04:59
	let resendIn = $state(17);
	let pinBusy = $state(false);

	$effect(() => {
		if (phase !== 'pin') return;
		const iv = setInterval(() => {
			countdown = Math.max(0, countdown - 1);
			resendIn = Math.max(0, resendIn - 1);
		}, 1000);
		return () => clearInterval(iv);
	});

	const mm = $derived(String(Math.floor(countdown / 60)).padStart(2, '0'));
	const ss = $derived(String(countdown % 60).padStart(2, '0'));
	const pinComplete = $derived(digits.every((d) => d !== ''));

	function onDigit(i: number, e: Event) {
		const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1);
		digits[i] = v;
		if (v && i < 5) cellRefs[i + 1]?.focus();
	}
	function onBack(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) cellRefs[i - 1]?.focus();
	}
	function activate() {
		if (!pinComplete) return;
		pinBusy = true;
		setTimeout(() => {
			phase = 'scan';
			pinBusy = false;
			toast('Scanner armed for 6 hours', 'success');
		}, 700);
	}

	/* ── phase B: scanning ──────────────────────────────────── */
	let videoEl: HTMLVideoElement | undefined = $state();
	let camOn = $state(false);
	let camError = $state(false);
	let manualCode = $state('');
	let last = $state<Checkin | null>(null);
	let counts = $state({ verified: 0, duplicate: 0, invalid: 0 });
	let online = $state(true);
	let queue = $state<{ code: string; at: string }[]>([]);
	let stream: MediaStream | null = null;
	let detectTimer: ReturnType<typeof setInterval> | null = null;
	let lastScanned: { code: string; at: number } | null = null;

	$effect(() => {
		queue = loadQueue();
		online = navigator.onLine;
		const on = () => {
			online = true;
			flushQueue();
		};
		const off = () => (online = false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
			stopCam();
		};
	});

	function loadQueue(): { code: string; at: string }[] {
		try {
			return JSON.parse(localStorage.getItem('owltside.scan-queue') ?? '[]');
		} catch {
			return [];
		}
	}
	function saveQueue(q: { code: string; at: string }[]) {
		localStorage.setItem('owltside.scan-queue', JSON.stringify(q));
	}
	async function flushQueue() {
		while (queue.length > 0 && online) {
			const item = queue[0];
			const ok = await postScan(item.code);
			queue = ok ? queue.slice(1) : queue;
			saveQueue(queue);
		}
	}

	async function postScan(code: string): Promise<boolean> {
		try {
			const res = await fetch('/api/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ eventId: event.id, code, gate })
			});
			if (!res.ok) throw new Error(String(res.status));
			const ck: Checkin = await res.json();
			last = ck;
			counts[ck.result] += 1;
			counts = counts;
			return true;
		} catch {
			queue = [...queue, { code, at: new Date().toISOString() }];
			saveQueue(queue);
			toast('Offline — scan queued, will sync', 'info');
			return false;
		}
	}

	async function verify(codeRaw: string) {
		const code = codeRaw.trim();
		if (!code) return;
		if (!online) {
			queue = [...queue, { code, at: new Date().toISOString() }];
			saveQueue(queue);
			toast('Offline — scan queued, will sync', 'info');
			return;
		}
		await postScan(code);
	}

	async function simulate() {
		if (!online) {
			toast('Simulator needs the demo server', 'info');
			return;
		}
		try {
			const res = await fetch('/api/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ eventId: event.id, gate, simulate: true })
			});
			if (!res.ok) throw new Error();
			const ck: Checkin = await res.json();
			last = ck;
			counts[ck.result] += 1;
			counts = counts;
		} catch {
			toast('No more tickets to scan', 'info');
		}
	}

	/* camera */
	async function startCam() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});
			if (videoEl) {
				videoEl.srcObject = stream;
				await videoEl.play();
			}
			camOn = true;
			camError = false;
			if ('BarcodeDetector' in window) {
				// @ts-expect-error BarcodeDetector not yet in lib.dom
				const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
				detectTimer = setInterval(async () => {
					if (!videoEl || videoEl.readyState < 2) return;
					const codes = await detector.detect(videoEl).catch(() => []);
					const value = codes[0]?.rawValue;
					if (value && (lastScanned?.code !== value || Date.now() - (lastScanned?.at ?? 0) > 4000)) {
						lastScanned = { code: value, at: Date.now() };
						await verify(value);
					}
				}, 400);
			}
		} catch {
			camError = true;
			toast('Camera unavailable — use manual codes', 'info');
		}
	}
	function stopCam() {
		if (detectTimer) clearInterval(detectTimer);
		detectTimer = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		camOn = false;
	}
</script>

<svelte:head><title>Ticket Scanner • Owltside</title></svelte:head>

<main class="flex flex-col relative w-full pt-3 pb-28 md:pb-16 bg-surface min-h-dvh">
	<header class="fixed top-0 left-0 w-full z-30 bg-surface/85 backdrop-blur-xl border-b border-surface-glass-border">
		<div class="flex items-center px-gutter h-16 md:max-w-3xl md:mx-auto w-full gap-2">
			<button
				onclick={() => (phase === 'scan' ? (phase = 'pin') : goto('/organizer'))}
				aria-label="Back"
				class="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
			>
				<ArrowLeft class="w-5.5 h-5.5" />
			</button>
			<div class="flex flex-col flex-1 min-w-0">
				<h1 class="font-display text-headline-md text-on-surface truncate leading-tight">
					{phase === 'pin' ? 'Verify Security Token' : 'Ticket Scanner'}
				</h1>
				<span class="text-label-badge text-on-surface-variant uppercase tracking-wider truncate">{event?.title ?? 'No event'}</span>
			</div>
			{#if events.length > 1}
				<select bind:value={eventId} class="max-w-[130px] px-2 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/30 text-body-sm text-on-surface">
					{#each events as e (e.id)}<option value={e.id}>{e.title}</option>{/each}
				</select>
			{/if}
		</div>
	</header>

	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md pt-20">
		{#if phase === 'pin'}
			<!-- security pills -->
			<div class="flex items-center justify-center gap-2 flex-wrap">
				<span class="flex items-center gap-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 px-3 py-1.5 text-label-badge text-on-surface-variant">
					<KeyRound class="w-3.5 h-3.5 text-primary" /> HMAC Token Vault • Step 2 of 2
				</span>
				<span class="flex items-center gap-1.5 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 px-3 py-1.5 text-label-badge text-accent-emerald">
					<ShieldCheck class="w-3.5 h-3.5" /> TLS 1.3
				</span>
			</div>

			<!-- glowing badge -->
			<div class="flex justify-center pt-space-sm">
				<div class="relative w-24 h-24 flex items-center justify-center">
					<span class="absolute inset-0 rounded-full bg-primary/20 blur-2xl"></span>
					<span class="absolute inset-2 rounded-full bg-primary/10 animate-pulse"></span>
					<span class="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 border border-outline-variant/40 flex items-center justify-center text-primary">
						<Lock class="w-7 h-7" />
					</span>
				</div>
			</div>

			<div class="flex flex-col items-center text-center gap-1">
				<h2 class="font-display text-headline-lg-mobile text-on-surface">Verify Security Token</h2>
				<p class="text-body-sm text-on-surface-variant">
					Enter the 6-digit code sent to <span class="text-on-surface">gate-staff@owltside.ng</span> to arm this device as {gate}.
				</p>
				<span class="font-code text-label-code text-primary mt-1">{mm}:{ss}</span>
			</div>

			<!-- OTP cells -->
			<div class="flex flex-col items-center gap-space-md">
				<div class="flex gap-2 justify-center">
					{#each digits as d, i (i)}
						<input
							bind:this={cellRefs[i]}
							type="text"
							inputmode="numeric"
							maxlength="1"
							value={d}
							oninput={(e) => onDigit(i, e)}
							onkeydown={(e) => onBack(i, e)}
							aria-label="Digit {i + 1}"
							class="w-12 h-14 text-center font-display text-headline-md rounded-xl border text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all {d ? 'bg-surface-container-high border-outline-variant/50' : 'bg-surface-container-low border-surface-glass-border'}"
						/>
					{/each}
				</div>
				<button
					type="button"
					class="w-full max-w-sm h-12 rounded-full bg-primary text-on-primary text-body-md font-semibold disabled:opacity-40 flex items-center justify-center gap-2 glow-primary"
					disabled={!pinComplete || pinBusy}
					onclick={activate}
				>
					{#if pinBusy}<span class="w-4 h-4 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin"></span>{:else}<ShieldCheck class="w-4 h-4" /> Arm scanner{/if}
				</button>
			</div>

			<div class="rounded-xl bg-surface-container-low border border-surface-glass-border p-space-md flex items-center justify-between">
				<p class="text-body-sm text-on-surface-variant">
					Didn't receive code? <span class="text-on-surface">{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend now'}</span>
				</p>
				<button
					class="flex items-center gap-1.5 text-body-sm font-medium text-primary disabled:opacity-40"
					disabled={resendIn > 0}
					onclick={() => { resendIn = 17; toast('New code sent', 'success'); }}
				>
					<RotateCw class="w-3.5 h-3.5" /> Resend
				</button>
			</div>
			<button class="flex items-center justify-center gap-2 text-body-sm text-on-surface-variant hover:text-on-surface" onclick={() => toast('Sent via instant message', 'success')}>
				<Zap class="w-3.5 h-3.5 text-accent-amber" /> Prefer instant message?
			</button>

		{:else}
			<!-- scan counters -->
			<div class="grid grid-cols-3 gap-2">
				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
					<p class="font-display text-headline-md-mobile text-accent-emerald">{counts.verified}</p>
					<p class="text-label-badge text-on-surface-variant uppercase">Verified</p>
				</div>
				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
					<p class="font-display text-headline-md-mobile text-accent-amber">{counts.duplicate}</p>
					<p class="text-label-badge text-on-surface-variant uppercase">Duplicate</p>
				</div>
				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
					<p class="font-display text-headline-md-mobile text-error">{counts.invalid}</p>
					<p class="text-label-badge text-on-surface-variant uppercase">Invalid</p>
				</div>
			</div>

			<!-- connectivity -->
			<div class="flex items-center justify-between rounded-xl px-space-md py-2.5 border {online ? 'bg-accent-emerald/5 border-accent-emerald/25' : 'bg-accent-amber/5 border-accent-amber/30'}">
				<span class="flex items-center gap-2 text-body-sm {online ? 'text-accent-emerald' : 'text-accent-amber'}">
					{#if online}<Wifi class="w-4 h-4" /> Online — scans sync instantly{:else}<WifiOff class="w-4 h-4" /> Offline — scans queued locally{/if}
				</span>
				{#if queue.length > 0}
					<span class="text-label-badge text-accent-amber">{queue.length} queued</span>
				{/if}
			</div>

			<!-- camera frame -->
			<div class="relative aspect-square w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-surface-container-low border border-dashed border-outline-variant/50 flex items-center justify-center">
				{#if camOn}
					<video bind:this={videoEl} muted playsinline class="absolute inset-0 w-full h-full object-cover"></video>
					<div class="absolute inset-x-8 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse"></div>
					<button class="absolute top-3 right-3 rounded-full bg-surface-container/80 backdrop-blur px-3 py-1.5 text-label-badge text-on-surface" onclick={stopCam}>
						Stop camera
					</button>
				{:else}
					<div class="flex flex-col items-center gap-3 p-6 text-center">
						<ScanLine class="w-10 h-10 text-on-surface-variant" />
						<p class="text-body-sm text-on-surface-variant">Point the camera at a ticket QR, or enter the code manually.</p>
						<button class="h-11 px-5 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 glow-primary" onclick={startCam}>
							<Camera class="w-4 h-4" /> Start camera
						</button>
						{#if camError}<p class="text-label-badge text-accent-amber">Camera blocked — manual entry below still works.</p>{/if}
					</div>
				{/if}
			</div>

			<!-- manual entry -->
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={manualCode}
					placeholder="EV-XXXX-XXXX-0001"
					class="flex-1 px-4 py-3 rounded-full bg-surface-container-low border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline font-code"
					onkeydown={(e) => { if (e.key === 'Enter') { verify(manualCode); manualCode = ''; } }}
				/>
				<button class="h-12 px-5 rounded-full bg-on-surface text-surface text-body-sm font-semibold" onclick={() => { verify(manualCode); manualCode = ''; }}>
					Verify
				</button>
			</div>
			<button class="h-11 rounded-full border border-dashed border-outline-variant/60 text-on-surface-variant text-body-sm font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors" onclick={simulate}>
				<Zap class="w-4 h-4" /> Simulate a scan (demo)
			</button>

			<!-- last result -->
			{#if last}
				<div class="rounded-xl p-space-md border flex items-center gap-space-md {last.result === 'verified' ? 'bg-accent-emerald/10 border-accent-emerald/30' : last.result === 'duplicate' ? 'bg-accent-amber/10 border-accent-amber/30' : 'bg-error/10 border-error/30'}">
					<span class="flex-shrink-0 {last.result === 'verified' ? 'text-accent-emerald' : last.result === 'duplicate' ? 'text-accent-amber' : 'text-error'}">
						{#if last.result === 'invalid'}<OctagonAlert class="w-8 h-8" />{:else}<CheckCircle2 class="w-8 h-8" />{/if}
					</span>
					<div class="flex flex-col min-w-0">
						<span class="font-display text-headline-md capitalize {last.result === 'verified' ? 'text-accent-emerald' : last.result === 'duplicate' ? 'text-accent-amber' : 'text-error'}">{last.result}</span>
						<span class="text-body-sm text-on-surface truncate">{last.holder} • {last.tier}</span>
						<span class="text-label-badge text-on-surface-variant font-code">{last.ticketCode} • {fmtRelative(last.at)}</span>
					</div>
				</div>
			{/if}

			<a href="/organizer" class="flex items-center justify-center gap-2 text-body-sm text-on-surface-variant hover:text-on-surface mt-2">
				<RadioTower class="w-3.5 h-3.5" /> Back to console
			</a>
			<button class="flex items-center justify-center gap-2 text-body-sm text-on-surface-variant" onclick={() => { stopCam(); phase = 'pin'; }}>
				Disarm scanner & return to PIN
			</button>
		{/if}
	</div>
</main>

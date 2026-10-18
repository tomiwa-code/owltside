<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		Bell,
		CheckCircle2,
		Camera,
		KeyRound,
		Lock,
		OctagonAlert,
		Plus,
		RadioTower,
		ScanLine,
		Search,
		ShieldCheck,
		Wifi,
		WifiOff,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import { page } from '$app/state';
	import type { Checkin, OrganizerPayload } from '$lib/types';
	import { fmtRelative } from '$lib/utils/dates';
	import { toast } from '$lib/state/toast.svelte';

	let { data } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const events = $derived(data.organizer.events);
	let eventId = $state(data.initialEventId ?? events[0]?.id ?? '');
	const event = $derived(events.find((e) => e.id === eventId) ?? events[0]);
	let gateName = $state(event?.gates?.[0]?.name ?? '');
	const gate = $derived(event?.gates?.find((configured) => configured.name === gateName)?.name ?? event?.gates?.[0]?.name ?? '');
	$effect(() => {
		if (event && !event.gates?.some((configured) => configured.name === gateName)) gateName = event.gates?.[0]?.name ?? '';
	});
	/** The scanner opens even with nothing set up yet — it then guides the setup. */
	const hasEvent = $derived(Boolean(event));
	const hasGate = $derived((event?.gates?.length ?? 0) > 0);
	const setupHref = $derived(event ? `/organizer/create?edit=${event.id}` : '/organizer/create');

	/* ── phase A: staff PIN ─────────────────────────────────── */
	let phase = $state<'pin' | 'scan'>('pin');
	let digits = $state(['', '', '', '', '', '']);
	let cellRefs: HTMLInputElement[] = [];
	let cellRefsDesk: HTMLInputElement[] = [];
	let pinBusy = $state(false);
	let pinError = $state('');
	let gateToken = $state('');

	const pinComplete = $derived(digits.every((d) => d !== ''));
	$effect(() => {
		eventId; gate;
		gateToken = '';
		phase = 'pin';
		digits = ['', '', '', '', '', ''];
		pinError = '';
	});

	function distributePin(value: string, refs: HTMLInputElement[]) {
		const numeric = value.replace(/\D/g, '').slice(-6);
		if (!numeric) return false;
		digits = Array.from({ length: 6 }, (_, index) => numeric[index] ?? '');
		pinError = '';
		refs[Math.min(numeric.length, 5)]?.focus();
		return true;
	}
	function onDigit(i: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const numeric = input.value.replace(/\D/g, '');
		if (numeric.length > 1) {
			distributePin(numeric, cellRefs);
			return;
		}
		digits[i] = numeric.slice(-1);
		if (digits[i] && i < 5) cellRefs[i + 1]?.focus();
	}
	async function pasteDigits(e: ClipboardEvent, refs: HTMLInputElement[]) {
		e.preventDefault();
		let raw = e.clipboardData?.getData('text') ?? '';
		if (!raw && navigator.clipboard?.readText) {
			try { raw = await navigator.clipboard.readText(); } catch { /* fallback handled below */ }
		}
		if (!distributePin(raw, refs)) pinError = 'Clipboard did not contain a six-digit PIN.';
	}
	function onBack(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) cellRefs[i - 1]?.focus();
	}
	function onDigitDesk(i: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const numeric = input.value.replace(/\D/g, '');
		if (numeric.length > 1) {
			distributePin(numeric, cellRefsDesk);
			return;
		}
		digits[i] = numeric.slice(-1);
		if (digits[i] && i < 5) cellRefsDesk[i + 1]?.focus();
	}
	function onBackDesk(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) cellRefsDesk[i - 1]?.focus();
	}
	async function activate() {
		if (!pinComplete || pinBusy || !event || !gate) return;
		pinBusy = true;
		pinError = '';
		try {
			const code = digits.join('');
			const response = await fetch('/api/scan/authorize', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ eventId: event.id, gate, code })
			});
			if (!response.ok) {
				const result = await response.json().catch(() => null);
				throw new Error(result?.message ?? result?.error ?? 'The gate PIN is invalid or expired.');
			}
			gateToken = code;
			phase = 'scan';
			toast(`Scanner armed for ${gate}`, 'success');
			void flushQueue();
		} catch (error) {
			pinError = error instanceof Error ? error.message : 'The gate PIN could not be verified.';
			toast(pinError, 'error');
		} finally { pinBusy = false; }
	}

	/* ── phase B: scanning ──────────────────────────────────── */
	let videoEl: HTMLVideoElement | undefined = $state();
	let videoElDesk: HTMLVideoElement | undefined = $state();
	let camEl: HTMLVideoElement | undefined;
	let camOn = $state(false);
	let camError = $state(false);
	let startingCamera = $state(false);
	let verifying = $state(false);
	let flushingQueue = false;
	let manualCode = $state('');
	let last = $state<Checkin | null>(null);
	let counts = $state({ verified: 0, duplicate: 0, invalid: 0 });
	let online = $state(true);
	let queue = $state<{ code: string; at: string; eventId?: string; gate?: string; staffToken?: string }[]>([]);
	let stream: MediaStream | null = null;
	let detectTimer: ReturnType<typeof setInterval> | null = null;
	let lastScanned: { code: string; at: number } | null = null;

	$effect(() => {
		// Read the stored queue into a local first: touching `queue` inside the
		// effect would make it depend on the state it writes.
		const stored = loadQueue();
		queue = stored;
		saveQueue(stored); // Strip any staff PINs left by an older scanner build.
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

	function loadQueue(): { code: string; at: string; eventId?: string; gate?: string }[] {
		try {
			const stored = JSON.parse(localStorage.getItem('owltside.scan-queue') ?? '[]');
			return Array.isArray(stored) ? stored.map(({ code, at, eventId, gate }) => ({ code, at, eventId, gate })) : [];
		} catch {
			return [];
		}
	}
	function saveQueue(q: { code: string; at: string; eventId?: string; gate?: string; staffToken?: string }[]) {
		// A staff PIN is a credential. Keep it in memory, never in persistent offline storage.
		localStorage.setItem('owltside.scan-queue', JSON.stringify(q.map(({ code, at, eventId, gate }) => ({ code, at, eventId, gate }))));
	}
	async function flushQueue() {
		if (flushingQueue) return;
		flushingQueue = true;
		try {
			while (queue.length > 0 && online && gateToken) {
				const index = queue.findIndex((item) => (item.eventId ?? event.id) === event.id && (item.gate ?? gate) === gate);
				if (index < 0) break;
				const item = queue[index];
				if (!await postScan(item.code, false, item)) break;
				queue = queue.filter((_, itemIndex) => itemIndex !== index); saveQueue(queue);
			}
		} finally { flushingQueue = false; }
	}

	async function postScan(code: string, queueOnFailure = true, context?: { eventId?: string; gate?: string; staffToken?: string }): Promise<boolean> {
		try {
			const res = await fetch('/api/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ eventId: context?.eventId ?? event.id, code, gate: context?.gate ?? gate, staffToken: context?.staffToken ?? gateToken })
			});
			if (!res.ok) { toast('Scan could not be verified. Please try again.', 'error'); return false; }
			const ck: Checkin = await res.json();
			last = ck;
			counts[ck.result] += 1;
			counts = counts;
			return true;
		} catch {
			if (queueOnFailure) queue = [...queue, { code, at: new Date().toISOString(), eventId: event.id, gate, staffToken: gateToken }];
			saveQueue(queue);
			toast('Offline — scan queued, will sync', 'info');
			return false;
		}
	}

	function ticketCodeFromScan(value: string): string {
		const raw = value.trim();
		const match = /^owltside:\/\/t\/([^/?#]+)(?:[?#].*)?$/i.exec(raw);
		if (!match) return raw;
		try { return decodeURIComponent(match[1]); } catch { return match[1]; }
	}

	async function verify(codeRaw: string) {
		const code = ticketCodeFromScan(codeRaw);
		if (!code || verifying) return;
		if (!online) {
			queue = [...queue, { code, at: new Date().toISOString(), eventId: event.id, gate, staffToken: gateToken }];
			saveQueue(queue);
			toast('Offline — scan queued, will sync', 'info');
			return;
		}
		verifying = true;
		try { await postScan(code); } finally { verifying = false; }
	}

	async function simulate() {
		if (verifying) return;
		if (!online) {
			toast('Simulator needs the demo server', 'info');
			return;
		}
		verifying = true;
		try {
			const res = await fetch('/api/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ eventId: event.id, gate, staffToken: gateToken, simulate: true })
			});
			if (!res.ok) throw new Error();
			const ck: Checkin = await res.json();
			last = ck;
			counts[ck.result] += 1;
			counts = counts;
		} catch {
			toast('No more tickets to scan', 'info');
		} finally { verifying = false; }
	}

	/* camera */
	async function startCam() {
		if (startingCamera) return;
		startingCamera = true;
		camError = false;
		camOn = true;
		await tick();
		try {
			if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.');
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});
			camEl = window.matchMedia('(min-width: 768px)').matches ? videoElDesk : videoEl;
			if (camEl) {
				camEl.srcObject = stream;
				await camEl.play();
			}
			if ('BarcodeDetector' in window) {
				// @ts-expect-error BarcodeDetector not yet in lib.dom
				const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
				detectTimer = setInterval(async () => {
					if (!camEl || camEl.readyState < 2) return;
					const codes = await detector.detect(camEl).catch(() => []);
					const value = codes[0]?.rawValue;
					if (value && (lastScanned?.code !== value || Date.now() - (lastScanned?.at ?? 0) > 4000)) {
						lastScanned = { code: value, at: Date.now() };
						await verify(value);
					}
				}, 400);
			}
		} catch {
			stopCam();
			camError = true;
			toast('Camera unavailable — use manual codes', 'info');
		} finally { startingCamera = false; }
	}
	function stopCam() {
		if (detectTimer) clearInterval(detectTimer);
		detectTimer = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (camEl) camEl.srcObject = null;
		camEl = undefined;
		camOn = false;
	}
</script>

<svelte:head><title>Ticket Scanner • Owltside</title></svelte:head>

<!-- Shared "set the scanner up" panel: the terminal is always open, it just
     tells the organizer what to finish before it can arm. -->
{#snippet setupPanel()}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-8 flex flex-col items-center text-center">
		<span class="relative w-24 h-24 flex items-center justify-center">
			<span class="absolute inset-0 rounded-full bg-primary/20 blur-2xl"></span>
			<span class="relative w-16 h-16 rounded-full bg-primary/10 border border-outline-variant/40 flex items-center justify-center text-primary">
				<ScanLine class="w-7 h-7" />
			</span>
		</span>
		<h2 class="font-display text-headline-lg text-on-surface mt-4">{hasEvent ? 'This event has no gate yet' : 'No event to scan yet'}</h2>
		<p class="text-body-sm text-on-surface-variant mt-1 max-w-md">
			{hasEvent
				? 'The scanner is ready — add a gate to this event and generate its staff PIN to arm this terminal.'
				: 'The scanner is ready — publish your first event, add a gate, and arm this terminal with its staff PIN.'}
		</p>
		<ol class="text-left text-body-sm text-on-surface-variant flex flex-col gap-1.5 mt-4">
			<li>1. {hasEvent ? 'Add a gate to this event' : 'Create your first event'}</li>
			<li>2. Generate the six-digit staff PIN in Organizer Console → Hardware &amp; Gates</li>
			<li>3. Enter the PIN here to arm the scanner</li>
		</ol>
		<div class="flex items-center gap-2.5 mt-6 flex-wrap justify-center">
			<a href={setupHref} class="h-11 px-5 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 glow-primary">
				<Plus class="w-4 h-4" /> {hasEvent ? 'Configure gates' : 'Create event'}
			</a>
			<a href="/organizer" class="h-11 px-5 rounded-full bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm font-medium flex items-center gap-2 hover:bg-surface-bright transition-colors">
				<RadioTower class="w-4 h-4" /> Back to console
			</a>
		</div>
	</section>
{/snippet}

<!-- ── desktop (md+) gate scanner terminal in the shipped console design
     language (design source unavailable this turn — extrapolated); mobile
     scanner below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">


	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-2 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
				<span>Gate_Node</span>
				<span class="text-outline-variant">/</span>
				<span>Scanner_Terminal</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Ticket Scanner & Gate Control</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Arm this terminal with a staff token, then verify tickets issued for this event and gate while connected or offline{hasGate ? ` at ${gate}` : ''}.</p>
		</div>
		<div class="flex items-center gap-3 flex-wrap">
			{#if events.length > 1}<select bind:value={eventId} aria-label="Choose event" class="max-w-48 px-3 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm text-on-surface">{#each events as e (e.id)}<option value={e.id}>{e.title}</option>{/each}</select>{/if}
			{#if (event?.gates?.length ?? 0) > 1}<select bind:value={gateName} aria-label="Choose gate" class="max-w-40 px-3 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm text-on-surface">{#each event?.gates ?? [] as configured (configured.id)}<option value={configured.name}>{configured.name}</option>{/each}</select>{/if}
			<span class="h-10 px-3.5 rounded-lg flex items-center gap-2 border {online ? 'border-accent-emerald/25 bg-accent-emerald/5 text-accent-emerald' : 'border-accent-amber/30 bg-accent-amber/5 text-accent-amber'} {MONO}">
				{#if online}<Wifi class="w-3.5 h-3.5" /> Connected{:else}<WifiOff class="w-3.5 h-3.5" /> Offline{/if}
				{#if queue.length > 0}<span class="text-accent-amber">• {queue.length} queued</span>{/if}
			</span>
			<a href="/organizer" class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors">
				<RadioTower class="w-4 h-4 text-on-surface-variant" /><span>Back to Console</span>
			</a>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
		<div class="min-w-0">
			{#if !hasEvent || !hasGate}
				{@render setupPanel()}
			{:else if phase === 'pin'}
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-8 flex flex-col items-center text-center">
					<div class="flex items-center justify-center gap-2 flex-wrap">
						<span class="flex items-center gap-1.5 rounded-full bg-surface-container-high border border-surface-glass-border px-3 py-1.5 {MONO} text-on-surface-variant">
							<KeyRound class="w-3.5 h-3.5 text-primary" /> Event Ticket Validation • Step 2 of 2
						</span>
						<span class="flex items-center gap-1.5 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 px-3 py-1.5 {MONO} text-accent-emerald">
							<ShieldCheck class="w-3.5 h-3.5" /> TLS 1.3
						</span>
					</div>
					<div class="relative w-24 h-24 flex items-center justify-center mt-6">
						<span class="absolute inset-0 rounded-full bg-primary/20 blur-2xl"></span>
						<span class="absolute inset-2 rounded-full bg-primary/10 animate-pulse"></span>
						<span class="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 border border-surface-glass-border flex items-center justify-center text-primary">
							<Lock class="w-7 h-7" />
						</span>
					</div>
					<h2 class="font-display text-headline-lg text-on-surface mt-4">Verify Security Token</h2>
					<p class="text-body-sm text-on-surface-variant mt-1 max-w-md">
						Enter the six-digit staff PIN generated in Organizer Console → Hardware &amp; Gates for {gate}.
					</p>
					<span class="font-code text-label-code text-primary mt-2">Staff PIN expires 6 hours after generation</span>
					<div class="flex gap-2.5 justify-center mt-6">
						{#each digits as d, i (i)}
							<input
								bind:this={cellRefsDesk[i]}
								type="text"
								inputmode="numeric"
								maxlength="1"
								value={d}
								oninput={(e) => onDigitDesk(i, e)}
								onpaste={(e) => pasteDigits(e, cellRefsDesk)}
								onkeydown={(e) => onBackDesk(i, e)}
								aria-label="Digit {i + 1}"
								class="w-14 h-16 text-center font-display text-headline-md rounded-xl border text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all {d ? 'bg-surface-container-high border-surface-glass-border' : 'bg-surface-container-low border-surface-glass-border'}"
							/>
						{/each}
					</div>
					{#if pinError}<p role="alert" class="text-body-sm text-error mt-4">{pinError}</p>{/if}
					<button
						type="button"
						class="w-full max-w-sm h-12 mt-6 rounded-lg bg-primary text-on-primary text-body-md font-semibold disabled:opacity-40 flex items-center justify-center gap-2 glow-primary"
						disabled={!pinComplete || pinBusy}
						onclick={activate}
					>
						{#if pinBusy}<span class="w-4 h-4 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin"></span>{:else}<ShieldCheck class="w-4 h-4" /> Arm scanner{/if}
					</button>
					<p class="text-label-badge text-on-surface-variant mt-4">Generate or rotate the PIN in Organizer Console → Hardware &amp; Gates.</p>
				</section>
			{:else}
				<div class="grid grid-cols-3 gap-5">
					{#each [
						['Verified', counts.verified, 'text-accent-emerald'],
						['Duplicate', counts.duplicate, 'text-accent-amber'],
						['Invalid', counts.invalid, 'text-error']
					] as [label, value, tone]}
						<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 text-center">
							<span class="font-display text-[30px] leading-9 font-bold tracking-tight {tone}">{value}</span>
							<span class="{MONO} text-on-surface-variant block mt-1">{label}</span>
						</section>
					{/each}
				</div>

				<div class="flex items-center justify-between rounded-lg px-4 py-2.5 border mt-5 {online ? 'bg-accent-emerald/5 border-accent-emerald/25' : 'bg-accent-amber/5 border-accent-amber/30'}">
					<span class="flex items-center gap-2 text-body-sm {online ? 'text-accent-emerald' : 'text-accent-amber'}">
						{#if online}<Wifi class="w-4 h-4" /> Connected — scans sync instantly{:else}<WifiOff class="w-4 h-4" /> Offline — scans queued locally{/if}
					</span>
					{#if queue.length > 0}
						<span class="{MONO} text-accent-amber">{queue.length} queued</span>
					{/if}
				</div>

				<div class="grid md:grid-cols-2 gap-5 mt-5">
					<section class="relative aspect-video rounded-xl overflow-hidden bg-surface-container-low border border-dashed border-surface-glass-border flex items-center justify-center">
						{#if camOn}
							<video bind:this={videoElDesk} muted playsinline class="absolute inset-0 w-full h-full object-cover"></video>
							<div class="absolute inset-x-10 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse"></div>
							<button class="absolute top-3 right-3 rounded-full bg-surface-container/80 backdrop-blur px-3 py-1.5 {MONO} text-on-surface" onclick={stopCam}>
								Stop camera
							</button>
						{:else}
							<div class="flex flex-col items-center gap-3 p-6 text-center">
								<ScanLine class="w-10 h-10 text-on-surface-variant" />
								<p class="text-body-sm text-on-surface-variant max-w-xs">Point the camera at a ticket QR, or verify a code manually on the right.</p>
								<button class="h-11 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 glow-primary" disabled={startingCamera} aria-busy={startingCamera} onclick={startCam}>
									<Camera class="w-4 h-4" /> {startingCamera ? 'Starting…' : 'Start camera'}
								</button>
								{#if camError}<p class="{MONO} text-accent-amber">Camera blocked — manual entry still works.</p>{/if}
							</div>
						{/if}
					</section>
					<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-3">
						<span class="{MONO} text-on-surface-variant">Manual Verification</span>
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={manualCode}
								placeholder="EV-XXXX-XXXX-0001"
								class="flex-1 min-w-0 px-4 py-3 rounded-lg bg-surface-container-low border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary font-code"
								onkeydown={(e) => { if (e.key === 'Enter') { verify(manualCode); manualCode = ''; } }}
							/>
							<button class="h-12 px-5 rounded-lg bg-on-surface text-surface-base text-body-sm font-semibold shrink-0" disabled={verifying} aria-busy={verifying} onclick={() => { verify(manualCode); manualCode = ''; }}>
								{verifying ? 'Verifying…' : 'Verify'}
							</button>
						</div>
						<button class="h-11 rounded-lg border border-dashed border-surface-glass-border text-on-surface-variant text-body-sm font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors" disabled={verifying} aria-busy={verifying} onclick={simulate}>
							<Zap class="w-4 h-4" /> {verifying ? 'Verifying…' : 'Simulate a scan (demo)'}
						</button>
						<p class="text-xs text-on-surface-variant mt-auto">Ticket codes are checked against the selected event; offline scans settle from the local queue when the link returns.</p>
					</section>
				</div>

				{#if last}
					<div class="rounded-xl p-5 border flex items-center gap-4 mt-5 {last.result === 'verified' ? 'bg-accent-emerald/10 border-accent-emerald/30' : last.result === 'duplicate' ? 'bg-accent-amber/10 border-accent-amber/30' : 'bg-error/10 border-error/30'}">
						<span class="flex-shrink-0 {last.result === 'verified' ? 'text-accent-emerald' : last.result === 'duplicate' ? 'text-accent-amber' : 'text-error'}">
							{#if last.result === 'invalid'}<OctagonAlert class="w-8 h-8" />{:else}<CheckCircle2 class="w-8 h-8" />{/if}
						</span>
						<div class="flex flex-col min-w-0">
							<span class="font-display text-headline-md capitalize {last.result === 'verified' ? 'text-accent-emerald' : last.result === 'duplicate' ? 'text-accent-amber' : 'text-error'}">{last.result}</span>
							<span class="text-body-sm text-on-surface truncate">{last.holder} • {last.tier}</span>
							<span class="{MONO} text-on-surface-variant">{last.ticketCode} • {fmtRelative(last.at)}</span>
						</div>
					</div>
				{/if}

				<div class="flex items-center justify-between gap-3 mt-5">
					<button class="flex items-center justify-center gap-2 text-body-sm text-on-surface-variant hover:text-on-surface" onclick={() => { stopCam(); phase = 'pin'; }}>
						<Lock class="w-3.5 h-3.5" /> Disarm scanner & return to PIN
					</button>
					<a href="/organizer" class="flex items-center justify-center gap-2 text-body-sm text-on-surface-variant hover:text-on-surface">
						<RadioTower class="w-3.5 h-3.5" /> Back to console
					</a>
				</div>
			{/if}
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Terminal Status</h2>
					<span class="{MONO} text-on-surface-variant">{phase === 'scan' ? 'Armed' : 'Standby'}</span>
				</div>
				<div class="flex flex-col gap-2 mt-4 text-body-sm">
					{#each [
						['Gate', gate],
						['Event', event?.title ?? 'No event'],
						['Staff PIN', phase === 'pin' ? 'Generate in console' : '6h authorization'],
						['QR refresh', '30s'],
						['Cipher', 'TLS 1.3']
					] as [label, value]}
						<div class="flex items-center justify-between gap-3">
							<span class="text-on-surface-variant">{label}</span>
							<span class="{MONO} text-on-surface truncate max-w-[60%] text-right">{value}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Scan Queue</h2>
					<span class="{MONO} text-on-surface-variant">{queue.length} Pending</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each queue.slice(0, 5) as q (q.code + q.at)}
						<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
							<span class="font-code text-label-code text-on-surface truncate">{q.code}</span>
							<span class="{MONO} text-on-surface-variant shrink-0">{fmtRelative(q.at)}</span>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant">Queue empty — every scan settled in real time.</p>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Gate Assignment</h2>
					<span class="{MONO} text-on-surface-variant">Node_0x7E3</span>
				</div>
				{#if events.length > 1}
					<label class="block mt-4">
						<span class="{MONO} text-on-surface-variant block mb-1.5">Active event</span>
						<select bind:value={eventId} class="w-full px-3 py-2.5 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm text-on-surface">
							{#each events as e (e.id)}<option value={e.id}>{e.title}</option>{/each}
						</select>
					</label>
				{:else}
					<p class="text-body-sm text-on-surface mt-4">{event?.title ?? 'No event'}</p>
				{/if}
				<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high px-4 py-3 mt-4">
					<span class="flex items-center gap-2 min-w-0 {MONO} text-on-surface-variant">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						Secure_Channel: RSA-4096
					</span>
					<span class="{MONO} text-outline-variant shrink-0">v2.4.1</span>
				</div>
			</section>
		</div>
	</div>

	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Decentralized Event Protocol</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					Mainnet 99.98% Operational
				</span>
				<span class="{MONO} text-on-surface-variant">Latency: 24ms</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">
<main class="flex flex-col relative w-full  pb-28 md:pb-16 bg-surface min-h-dvh">
	<section class="border-b border-surface-glass-border">
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
			{#if (event?.gates?.length ?? 0) > 1}
				<select bind:value={gateName} aria-label="Choose gate" class="max-w-[125px] px-2 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/30 text-body-sm text-on-surface">
					{#each event?.gates ?? [] as configured (configured.id)}<option value={configured.name}>{configured.name}</option>{/each}
				</select>
			{/if}
		</div>
	</section>

	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md pt-space-sm">
		{#if !hasEvent || !hasGate}
			{@render setupPanel()}
		{:else if phase === 'pin'}
			<!-- security pills -->
			<div class="flex items-center justify-center gap-2 flex-wrap">
				<span class="flex items-center gap-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 px-3 py-1.5 text-label-badge text-on-surface-variant">
					<KeyRound class="w-3.5 h-3.5 text-primary" /> Event Ticket Validation • Step 2 of 2
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
					Enter the six-digit staff PIN generated in Organizer Console → Hardware &amp; Gates for {gate}.
				</p>
				<span class="font-code text-label-code text-primary mt-1">Staff PIN expires 6 hours after generation · {digits.filter(Boolean).length}/6 entered</span>
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
							onpaste={(e) => pasteDigits(e, cellRefs)}
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

			<p class="text-label-badge text-on-surface-variant text-center">Generate or rotate the PIN in Organizer Console → Hardware &amp; Gates.</p>

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
					{#if online}<Wifi class="w-4 h-4" /> Connected — scans sync instantly{:else}<WifiOff class="w-4 h-4" /> Offline — scans queued locally{/if}
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
						<button class="h-11 px-5 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 glow-primary" disabled={startingCamera} aria-busy={startingCamera} onclick={startCam}>
							<Camera class="w-4 h-4" /> {startingCamera ? 'Starting…' : 'Start camera'}
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
				<button class="h-12 px-5 rounded-full bg-on-surface text-surface text-body-sm font-semibold" disabled={verifying} aria-busy={verifying} onclick={() => { verify(manualCode); manualCode = ''; }}>
					{verifying ? 'Verifying…' : 'Verify'}
				</button>
			</div>
			<button class="h-11 rounded-full border border-dashed border-outline-variant/60 text-on-surface-variant text-body-sm font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors" disabled={verifying} aria-busy={verifying} onclick={simulate}>
				<Zap class="w-4 h-4" /> {verifying ? 'Verifying…' : 'Simulate a scan (demo)'}
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
</div>

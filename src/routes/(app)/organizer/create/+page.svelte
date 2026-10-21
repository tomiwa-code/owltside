<script lang="ts">
	import { onMount } from 'svelte';
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		ArrowRight,
		BadgeCheck,
		Bell,
		Bold,
		CalendarDays,
		Check,
		ChevronDown,
		Clock,
		CloudUpload,
		Code,
		Copy,
		Info,
		Italic,
		Landmark,
		Link2,
		List,
		ListOrdered,
		Lock,
		MapPin,
		Megaphone,
		Mic,
		Pencil,
		Plus,
		Quote,
		Rocket,
		Save,
		ScanBarcode,
		ScanLine,
		Search,
		Share2,
		ShieldCheck,
		SlidersHorizontal,
		Smartphone,
		Trash2,
		TrendingUp,
		UserPlus,
		Tag,
		Percent,
		Gift,
		X,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Cover from '$components/Cover.svelte';
	import ImageCropSheet from '$components/ImageCropSheet.svelte';
	import { formatMoney } from '$lib/utils/money';
	import { fmtDate } from '$lib/utils/dates';
	import { NIGERIAN_STATES } from '$lib/constants/nigeria-states';
	import { browser } from '$app/environment';
	import { toast } from '$lib/state/toast.svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { categories } from '$components/iconMap';
	import { isValidPromoCode, normalizeEventPromos, normalizePromoCode } from '$lib/utils/promo';
	import { maskAccountNumber, payoutBankMark } from '$lib/utils/payout';
import type { Profile, WizardSpeaker } from '$lib/types';
	import type { PageData } from './$types';

	let { form, data = {} as PageData } = $props();
	let draftHydrated = $state(false);
	const editingEvent = $derived(data.event ?? null);
	// Every settlement line in the wizard reads the account verified in Settings.
	const savedPayout = $derived(appSettings.value.payout);
	const savedPayoutReady = $derived(appSettings.value.verification.payoutAccount && !!savedPayout.bank);

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';
	let dateEnd = $state('');
	const demoCover = { from: '#4c1d95', to: '#0b1326', icon: 'audio-waveform' };
	let coverUrl = $state<string | null>(null);
	let coverName = $state<string | null>(null);
	let coverError = $state('');
	let posterCropFile = $state<File | null>(null);
	let pendingPosterName = $state<string | null>(null);

	function handleCoverSelect(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
			coverError = 'Please select a JPEG, PNG, or WebP image.';
			toast(coverError, 'error');
			return;
		}
		if (file.size > 12 * 1024 * 1024) {
			coverError = 'Image must be under 12MB.';
			toast(coverError, 'error');
			return;
		}
		coverError = '';
		pendingPosterName = file.name;
		posterCropFile = file;
	}
	function applyCroppedPoster(dataUrl: string) {
		coverUrl = dataUrl;
		coverName = pendingPosterName ?? 'poster.jpg';
		coverError = '';
		posterCropFile = null;
		pendingPosterName = null;
		toast('Cover image cropped — will be saved with your event', 'success');
	}
	function closePosterCrop() {
		posterCropFile = null;
		pendingPosterName = null;
	}
	function clearCover() {
		coverUrl = null;
		coverName = null;
		coverError = '';
		posterCropFile = null;
		pendingPosterName = null;
	}


	/* ── draft state ─────────────────────────────────────────── */
	let step = $state(1);
	let title = $state('');
	let date = $state('');
	let venue = $state('');
	let city = $state('Lagos');
	let description = $state('');
	let selectedCategory = $state('');
	let customCategory = $state('');
	const categoryOptions = categories.filter((category) => category.id !== 'all');

	let tiers = $state<Array<{ name: string; price: number; capacity: number; benefits: string; editing: boolean }>>([]);
	let promos = $state<Array<{ code: string; percent: number; maxUses: number; uses?: number }>>([]);
	const activePromoCount = $derived(promos.filter((promo) => (promo.uses ?? 0) < promo.maxUses).length);
	let promoCode = $state('');
	let promoPercent = $state('');
	let promoMax = $state('');
	let promoError = $state('');
	let showDescriptionPreview = $state(false);
	let publishExplore = $state(true);
	let broadcast = $state(true);
	let launchMode = $state<'now' | 'staged'>('now');

	let days = $state<Array<{ label: string; sessions: Array<{ time: string; title: string; stage: string }> }>>([]);
	let dayIdx = $state(0);
	let newSession = $state({ time: '12:00', title: '', stage: '' });

	let gates = $state<Array<{ name: string; staff: number }>>([]);
	let roster = $state<WizardSpeaker[]>([]);
	let showInviteDialog = $state(false);
	let inviteName = $state('');
	let inviteRole = $state('');
	let inviteMatches = $state<Profile[]>([]);
	let selectedInvitee = $state<Profile | null>(null);
	let searchingProfiles = $state(false);
	let inviteError = $state('');
	let profileSearchSequence = 0;
	let displaySpeakerSequence = 0;
	const inviteCanSubmit = $derived(
		inviteName.trim().length >= 2 &&
		inviteRole.trim().length >= 2 &&
		(!inviteName.trim().startsWith('@') || selectedInvitee?.handle.toLowerCase() === inviteName.trim().slice(1).toLowerCase())
	);

	/* ── derived ─────────────────────────────────────────────── */
	const stepMeta: Record<number, { title: string; sub: string }> = {
		1: { title: 'Basics & Info', sub: 'Set the foundation of your event' },
		2: { title: 'Tickets & Pricing', sub: 'Set capacity, multi-currency display, and door access parameters' },
		3: { title: 'Schedule & Lineup', sub: 'Timeline sessions across days and stages' },
		4: { title: 'Gate Ops & Verification', sub: 'Configure lanes, staff and offline verification' },
		5: { title: 'Review & Launch', sub: 'Final checks before going live' }
	};
	const categoryLabel = $derived(
		selectedCategory === 'custom'
			? customCategory.trim()
			: (categoryOptions.find((category) => category.id === selectedCategory)?.label ?? '')
	);
	const basicsValid = $derived(
		title.trim().length >= 3 &&
			categoryLabel.length >= 2 &&
			date !== '' &&
			dateEnd !== '' &&
			dateEnd >= date &&
			venue.trim().length >= 2 &&
			(city.trim() || 'Lagos') !== '' &&
			description.trim().length >= 10 &&
			(Boolean(coverUrl) || Boolean(editingEvent))
	);
	const tiersValid = $derived(
		tiers.length > 0 &&
			tiers.every((t) => t.name.trim().length > 0 && Number(t.capacity) >= 1 && Number(t.price) >= 0)
	);
	const canContinue = $derived(
		step === 1
			? basicsValid
			: step === 2
				? tiersValid
				: step === 5
					? basicsValid && tiersValid
					: true
	);
	let allowOverride = $state(true);
	let allowOffline = $state(true);
	let restrictGates = $state(true);
	let hmacRotation = $state(true);
	let offlineKeyring = $state(true);
	let biometricFast = $state(true);
	let conflictPolicy = $state('strict');
	const draftJson = $derived(
		JSON.stringify({
			poster: coverUrl ?? '',
			title: title.trim(),
			category: selectedCategory === 'custom' ? categoryLabel : selectedCategory,
			tags: categoryLabel ? [categoryLabel] : [],
			speakers: roster,
			date,
			dateEnd,
			venue: venue.trim(),
			city: city.trim() || 'Lagos',
			description: description.trim(),
			security: { allowOverride, allowOffline, restrictGates, hmacRotation, offlineKeyring, biometricFast, conflictPolicy },
			distribution: { publishExplore, broadcast, launchMode },
			tiers: tiers.map(({ editing: _e, ...t }) => ({
				...t,
				price: Number(t.price ?? 0),
				capacity: Number(t.capacity ?? 0)
			})),
			promos: promos.map((promo) => ({
				code: normalizePromoCode(promo.code),
				percent: Number(promo.percent ?? 0),
				maxUses: Number(promo.maxUses ?? 0)
			})),
			days: days.map((d) => ({ label: d.label, sessions: d.sessions })),
			gates
		})
	);
	const totalCapacity = $derived(tiers.reduce((s, t) => s + t.capacity, 0));
	const minTierPrice = $derived(tiers.length ? Math.min(...tiers.map((t) => t.price)) : 0);
	const totalGross = $derived(tiers.reduce((s, t) => s + t.price * t.capacity, 0));
	const millions = (n: number) => `₦${(n / 1_000_000).toFixed(0)}M`;

	/* ── desktop steps 3–4 (Execution Matrix & Gate Hardware) ── */
	let showComposer = $state(false);
	let gateEdit = $state(-1);

	const sessionDesc = [
		'Autonomous protocol negotiation and agentic tool invocation benchmarks across multi-chain primitives.',
		'Deterministic JIT compilation, cold start mitigation, and verifiable proof-of-replication pipelines.',
		'Live on-stage contract deployments and stress-testing under simulated Byzantine fault conditions.'
	];
	const sessionTypes = ['Keynote', 'Deep Dive', 'Showcase', 'Workshop'];
	const gateSubs = [
		'General Admission West Entry • NFC Contactless & High-Density Barcode Array',
		'Hall A North Annex • Zero-Knowledge Biometric Turnstile & Dynamic QR',
		'Service & Press Corridor • Manual Verify Lane with Hardware Nonce Check'
	];

	function timeRange(t: string): string {
		const [h, m] = t.split(':').map(Number);
		const start = h * 60 + m;
		const end = start + 75;
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(Math.floor(start / 60))}:${pad(start % 60)} — ${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
	}

	function copyPwaLink() {
		try {
			void navigator.clipboard?.writeText('https://owltside.app/scan');
		} catch {
			/* clipboard unavailable — toast still confirms the deep link */
		}
		toast('Scanner PWA link copied', 'success');
	}

	/* ── desktop step 5 (Review & Pre-Flight Clearance) ── */
	const sessionCount = $derived(days.reduce((s, d) => s + d.sessions.length, 0));
	const staffTotal = $derived(gates.reduce((s, g) => s + g.staff, 0));
	const totalChecks = 5;
	const validatedCount = $derived([basicsValid, tiersValid, days.reduce((s, d) => s + d.sessions.length, 0) > 0, gates.length > 0, Boolean(coverUrl)].filter(Boolean).length);
	const validated = $derived(validatedCount === totalChecks && canContinue);
	const stepValidated = $derived(step === 1 ? basicsValid : tiersValid);

	function saveDraft() {
		if (!browser) return;
		try {
			localStorage.setItem('owltside.wizard.draft.v1', JSON.stringify({ draft: JSON.parse(draftJson), step }));
			toast('Draft saved — it will be here when you return', 'success');
		} catch {
			toast('Draft could not be saved. Try removing the poster or using a smaller image.', 'error');
		}
	}

	function hydrateDraft(draft: Record<string, any>) {
		coverUrl = typeof draft.poster === 'string' ? draft.poster : '';
		title = draft.title ?? '';
		const category = String(draft.category ?? '');
		selectedCategory = categoryOptions.some((item) => item.id === category) ? category : category ? 'custom' : '';
		customCategory = selectedCategory === 'custom' ? category : '';
		date = draft.date ?? '';
		dateEnd = draft.dateEnd ?? '';
		venue = draft.venue ?? '';
		city = draft.city ?? 'Lagos';
		description = draft.description ?? '';
		tiers = (draft.tiers ?? []).map((tier: any) => ({ name: tier.name ?? '', price: Number(tier.price ?? 0), capacity: Number(tier.capacity ?? 0), benefits: tier.benefits ?? '', editing: false }));
		days = (draft.days ?? []).map((day: any) => ({ label: day.label ?? 'Day 1', sessions: (day.sessions ?? []).map((session: any) => ({ time: session.time ?? '12:00', title: session.title ?? '', stage: session.stage ?? '' })) }));
		roster = (draft.speakers ?? []).map((speaker: any) => ({ ...speaker }));
		gates = (draft.gates ?? []).map((gate: any) => ({ name: gate.name ?? 'Gate', staff: Number(gate.staff ?? gate.staff?.length ?? 1) }));
		promos = normalizeEventPromos(draft.promos ?? []);
		const security = draft.security ?? {};
		allowOverride = security.allowOverride ?? true;
		allowOffline = security.allowOffline ?? true;
		restrictGates = security.restrictGates ?? true;
		hmacRotation = security.hmacRotation ?? true;
		offlineKeyring = security.offlineKeyring ?? true;
		biometricFast = security.biometricFast ?? true;
		conflictPolicy = security.conflictPolicy ?? 'strict';
		const distribution = draft.distribution ?? {};
		publishExplore = distribution.publishExplore ?? true;
		broadcast = distribution.broadcast ?? true;
		launchMode = distribution.launchMode ?? 'now';
	}

	onMount(() => {
		if (editingEvent) {
			const startsAt = new Date(editingEvent.startsAt);
			const endsAt = new Date(editingEvent.endsAt ?? editingEvent.startsAt);
			const sessionsByDay = new Map<string, Array<{ time: string; title: string; stage: string }>>();
			for (const item of editingEvent.agenda ?? []) {
				const match = item.start.match(/^(.*?)(?:\s+)(\d{2}:\d{2})$/);
				const day = match?.[1] || 'Day 1';
				const time = match?.[2] || '12:00';
				const sessions = sessionsByDay.get(day) ?? [];
				sessions.push({ time, title: item.title, stage: item.location ?? 'Main stage' });
				sessionsByDay.set(day, sessions);
			}
			hydrateDraft({
				title: editingEvent.title, category: editingEvent.category, poster: editingEvent.cover.src ?? '',
				date: startsAt.toISOString().slice(0, 10), dateEnd: endsAt.toISOString().slice(0, 10),
				venue: editingEvent.venue, city: editingEvent.city, description: editingEvent.description,
				tiers: editingEvent.tiers, promos: editingEvent.promos ?? [], days: [...sessionsByDay].map(([label, sessions]) => ({ label, sessions })),
				speakers: editingEvent.speakers, gates: (editingEvent.gates ?? []).map((gate) => ({ name: gate.name, staff: gate.staff.length })),
				distribution: { launchMode: editingEvent.live ? 'now' : 'staged' }
			});
			step = 1;
		} else {
			try {
				const saved = JSON.parse(localStorage.getItem('owltside.wizard.draft.v1') ?? 'null');
				if (saved?.draft) { hydrateDraft(saved.draft); step = Math.max(1, Math.min(5, Number(saved.step ?? 1))); }
				else if (saved && typeof saved === 'object') hydrateDraft(saved);
			} catch { /* start with a fresh wizard if draft storage is corrupt */ }
		}
		draftHydrated = true;
	});

	$effect(() => {
		if (!browser || !draftHydrated || editingEvent) return;
		try { localStorage.setItem('owltside.wizard.draft.v1', JSON.stringify({ draft: JSON.parse(draftJson), step })); }
		catch { /* Explicit Save Draft displays the actionable storage error. */ }
	});

	function publishHandler() {
		return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			if (result.type === 'redirect' && browser && !editingEvent) localStorage.removeItem('owltside.wizard.draft.v1');
			await update();
		};
	}

	/* ── helpers ─────────────────────────────────────────────── */
	function openInviteDialog() {
		inviteName = ''; inviteRole = ''; inviteMatches = []; selectedInvitee = null; inviteError = '';
		showInviteDialog = true;
	}

	async function searchInviteProfiles() {
		const typedName = inviteName.trim();
		const handle = typedName.startsWith('@') ? typedName.slice(1).toLowerCase() : '';
		const sequence = ++profileSearchSequence;
		inviteMatches = []; inviteError = '';
		if (handle.length < 1) { searchingProfiles = false; return; }
		searchingProfiles = true;
		try {
			const response = await fetch(`/api/profiles/search?q=${encodeURIComponent(handle)}`);
			if (!response.ok) throw new Error('Profile lookup is unavailable. Try again.');
			const profiles = (await response.json()) as Profile[];
			if (sequence === profileSearchSequence) inviteMatches = profiles;
		} catch (error) {
			if (sequence === profileSearchSequence) inviteError = error instanceof Error ? error.message : 'Profile lookup is unavailable.';
		} finally {
			if (sequence === profileSearchSequence) searchingProfiles = false;
		}
	}

	function selectInvitee(profile: Profile) { selectedInvitee = profile; inviteName = `@${profile.handle}`; inviteMatches = []; inviteError = ''; }

	function addSpeaker() {
		const name = inviteName.trim(); const role = inviteRole.trim();
		if (!name || role.length < 2) { inviteError = 'Enter a name and role to continue.'; return; }
		if (name.startsWith('@')) {
			const handle = name.slice(1).toLowerCase();
			if (!selectedInvitee || selectedInvitee.handle.toLowerCase() !== handle) { inviteError = 'Choose a matching Owltside profile before sending an invite.'; return; }
			if (roster.some((speaker) => speaker.handle?.toLowerCase() === handle && speaker.invited)) { inviteError = `An invite for @${handle} is already in this roster.`; return; }
			const profile = selectedInvitee;
			roster = [...roster, { id: profile.id, handle: profile.handle, name: profile.name, avatarColor: profile.avatarColor, avatarUrl: profile.avatarUrl, bio: profile.bio ?? '', role, org: `@${profile.handle}`, tag: role.slice(0, 24), displayOnly: false, invited: true, followers: profile.followers, following: profile.following, city: profile.city ?? undefined }];
			toast(`Invite for @${profile.handle} queued for event publication`, 'success');
		} else {
			if (roster.some((speaker) => speaker.name.toLowerCase() === name.toLowerCase())) { inviteError = 'A speaker with that name is already in this roster.'; return; }
			roster = [...roster, { id: `display-${Date.now()}-${++displaySpeakerSequence}`, name, avatarColor: '#8083ff', bio: '', role, org: 'Display only · no profile linked', tag: role.slice(0, 24), displayOnly: true, invited: false }];
			toast(`${name} added as a display-only speaker`, 'success');
		}
		showInviteDialog = false;
	}

	function removeSpeaker(speaker: WizardSpeaker) { roster = roster.filter((item) => item !== speaker); }

	function next() {
		if (!canContinue) return;
		step = Math.min(5, step + 1);
		scrollTo({ top: 0 });
	}
	function back() {
		if (step === 1) goto('/organizer');
		else {
			step -= 1;
			scrollTo({ top: 0 });
		}
	}
	function addTier() {
		tiers = [...tiers, { name: 'New Tier', price: 10000, capacity: 100, benefits: '', editing: true }];
	}
	function addPromo() {
		promoError = '';
		const code = normalizePromoCode(promoCode);
		const percent = Number(promoPercent);
		const maxUses = Number(promoMax);
		if (!code) { promoError = 'Enter a promo code.'; return; }
		if (!isValidPromoCode(code)) { promoError = 'Use 3–24 letters, numbers, hyphens, or underscores.'; return; }
		if (!Number.isFinite(percent) || percent < 1 || percent > 100) { promoError = 'Enter % off between 1 and 100.'; return; }
		if (!Number.isFinite(maxUses) || maxUses < 1 || !Number.isInteger(maxUses)) { promoError = 'Enter number of purchases (e.g. 50).'; return; }
		if (promos.some((p) => normalizePromoCode(p.code) === code)) { promoError = 'That promo code already exists.'; return; }
		promos = [...promos, { code, percent, maxUses }];
		promoCode = ''; promoPercent = ''; promoMax = '';
		toast(`Promo "${code}" — ${percent}% off, first ${maxUses} purchases — will go live when this event is ${editingEvent ? 'saved' : 'published'}`, 'success');
	}
	function removePromo(idx: number) {
		promos = promos.filter((_, i) => i !== idx);
	}
	function addDay() {
		const base = date ? new Date(`${date}T00:00:00`) : new Date();
		if (isNaN(base.getTime())) base.setTime(Date.now());
		base.setDate(base.getDate() + days.length);
		const label = base.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
		days = [...days, { label, sessions: [] }];
		dayIdx = days.length - 1;
	}
	function addSession() {
		if (!newSession.title.trim() || !newSession.stage.trim()) { toast('Add a session title and room or stage name', 'info'); return; }
		const d = days[dayIdx];
		d.sessions = [...d.sessions, { ...newSession, title: newSession.title.trim(), stage: newSession.stage.trim() }];
		newSession = { ...newSession, title: '', stage: '' };
	}
</script>

<svelte:head><title>New Event Wizard • Owltside</title></svelte:head>

<!-- ── desktop (md+) "Create Architecture Node" — basics & tickets blocks per
     the desktop design source, themed with Evently Pulse tokens. Steps 3–5 keep
     the existing wizard surface; mobile is unchanged everywhere. ── -->
{#if step <= 2}
	<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
		<!-- console header -->
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8">
			<div class="flex items-center gap-2 {MONO} text-on-surface-variant min-w-0">
				<span class="truncate">Protocol Console // 04-Create</span>
				<span class="text-outline-variant">•</span>
				<span class="truncate">Draft • New</span>
			</div>
			<div class="flex flex-wrap items-end justify-between gap-4 pt-3">
				<h1 class="font-display text-headline-lg md:text-[34px] leading-tight text-on-surface">Create Architecture Node</h1>
				<div class="flex items-center gap-4 pb-1">
					<span class="{MONO} text-on-surface-variant">Auto-saved 7m ago</span>
					<button type="button" onclick={saveDraft} class="h-10 px-4 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors">
						<Save class="w-4 h-4" /> Save Draft
					</button>
				</div>
			</div>

			<!-- stepper (image design 01-05 with subs) -->
			<div class="grid grid-cols-5 gap-3 pt-6">
				{#each ([
					[1, 'Basics & Venue', venue ? venue.slice(0, 18) : 'No venue yet'],
					[2, 'Tickets & Pools', `${tiers.length} Tiers\u00B7${tiers.reduce((s, tt) => s + (Number(tt.capacity) || 0), 0)} Cap`],
					[3, 'Schedule & Lineup', `${days.reduce((s, d) => s + d.sessions.length, 0)} Sessions Pinned`],
					[4, 'Gate Infrastructure', `HMAC 30s\u00B76 Scanners`],
					[5, 'Review & Deploy', validated ? '100% Validated' : `${validatedCount}/${totalChecks} Checks`]
				] as [number, string, string][]) as [n, label, sub]}
					<button
						type="button"
						onclick={() => {
							step = n;
							scrollTo({ top: 0 });
						}}
						class="rounded-lg border p-3 flex flex-col gap-1 text-left transition-colors
							{n == step
								? 'border-primary/40 bg-surface-container-high'
								: n < step
									? 'border-accent-emerald/30 bg-surface-container'
									: 'border-transparent bg-surface-container/40 hover:bg-surface-container'}"
					>
						<span class="flex items-center gap-2.5">
							<span
								class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-code text-label-badge font-bold
									{n < step
										? 'bg-accent-emerald text-on-primary'
										: n == step
											? 'bg-primary text-on-primary'
											: 'bg-surface-container-high text-on-surface-variant'}"
							>
								{#if n < step}<Check class="w-3.5 h-3.5" />{:else}{String(n).padStart(2, '0')}{/if}
							</span>
							<span class="{MONO} text-on-surface-variant">Step {String(n).padStart(2, '0')}{n == step ? ' // Active' : n < step ? ' ✓' : ''}</span>
						</span>
						<span class="text-body-sm font-semibold text-on-surface truncate">{label}</span>
						<span class="font-code text-[11px] tracking-[0.08em] truncate {n == step ? 'text-primary' : n < step ? 'text-accent-emerald' : 'text-on-surface-variant'}">{sub}{n === 5 && Number(step) === 5 && validated ? ' · LAUNCH READY' : ''}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- main grid -->
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8 grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px] gap-6 xl:gap-8 items-start">
			<!-- left column -->
			<div class="flex flex-col gap-6 min-w-0">
				{#if step === 1}
				<!-- BLOCK A -->
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6 xl:p-7 flex flex-col gap-6">
					<div class="flex items-center justify-between gap-4">
						<span class="flex items-center gap-3 min-w-0">
							<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface px-2 py-0.5 rounded shrink-0">Block A</span>
							<h2 class="font-display text-headline-md text-on-surface truncate">Event Essentials &amp; Physical Space</h2>
						</span>
						<span class="{MONO} text-on-surface-variant shrink-0">Verified Host Node</span>
					</div>

					<div class="flex flex-col gap-2">
						<span class="{MONO} text-on-surface-variant">Event Identity / Canonical Title</span>
						<input
							type="text"
							maxlength="80"
							bind:value={title}
							placeholder="e.g. Lagos Sound & Tech Fusion 2026"
							class="w-full h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50 transition-colors"
						/>
						<span class="text-body-sm text-on-surface-variant">Will be registered immutably on-chain during block confirmation.</span>
					</div>

					<div class="flex flex-col gap-2">
						<label for="event-category-desktop" class="{MONO} text-on-surface-variant">Category</label>
						<select id="event-category-desktop" bind:value={selectedCategory} class="w-full h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50">
							<option value="" disabled>Select category</option>
							{#each categoryOptions as category (category.id)}<option value={category.id}>{category.label}</option>{/each}
							<option value="custom">Custom category…</option>
						</select>
						{#if selectedCategory === 'custom'}<input type="text" bind:value={customCategory} maxlength="48" placeholder="Enter a custom category" class="w-full h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />{/if}
					</div>

					<div class="flex flex-col gap-0">
						<span class="{MONO} text-on-surface-variant pb-2">Comprehensive Program Brief (Markdown Enabled)</span>
						<div class="flex items-center gap-1 bg-surface-container-high border border-surface-glass-border rounded-t-lg px-2 py-1.5">
							{#each [Bold, Italic, Link2, Code, List, ListOrdered, Quote] as Icon, i (i)}
								<button type="button" aria-label="Format" onclick={() => toast('Markdown toolbar parses on publish', 'info')} class="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors">
									<Icon class="w-3.5 h-3.5" />
								</button>
							{/each}
							<span class="{MONO} text-on-surface-variant ml-auto pr-2">MD_Parser_v2</span>
						</div>
						<textarea
							bind:value={description}
							rows="5"
							maxlength="600"
							placeholder="What will attendees experience?"
							class="w-full px-4 py-3 rounded-b-lg bg-surface-base border border-t-0 border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50 transition-colors resize-y"
						></textarea>
					</div>

					<div class="grid sm:grid-cols-2 gap-4">
						<div class="flex flex-col gap-2">
							<span class="{MONO} text-on-surface-variant">Timestamp Begin (UTC+1 WAT)</span>
							<div class="relative">
								<input type="date" bind:value={date} class="w-full h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md [color-scheme:dark] focus:outline-none focus:border-primary/50" />
								<CalendarDays class="w-4 h-4 text-on-surface-variant absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
							</div>
						</div>
						<div class="flex flex-col gap-2">
							<span class="{MONO} text-on-surface-variant">Timestamp Conclude (UTC+1 WAT)</span>
							<div class="relative">
								<input type="date" bind:value={dateEnd} class="w-full h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md [color-scheme:dark] focus:outline-none focus:border-primary/50" />
								<CalendarDays class="w-4 h-4 text-on-surface-variant absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
							</div>
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<span class="{MONO} text-on-surface-variant">Physical Venue &amp; Geolocation Coordinates</span>
						<div class="rounded-lg border border-surface-glass-border bg-surface-base p-4 flex items-center gap-3">
							<span class="w-9 h-9 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center shrink-0">
								<MapPin class="w-4 h-4" />
							</span>
							<div class="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-1">
								<label for="event-venue-desktop" class="min-w-0 text-label-badge text-on-surface-variant">Venue
									<input id="event-venue-desktop" type="text" bind:value={venue} placeholder="The Civic Centre" class="block w-full bg-transparent text-body-md font-semibold text-on-surface focus:outline-none" />
								</label>
								<label for="event-city-desktop" class="min-w-0 text-label-badge text-on-surface-variant">City / state
									<select id="event-city-desktop" bind:value={city} required class="block w-full bg-transparent text-body-md text-on-surface focus:outline-none">
										<option value="" disabled>Select state</option>
										{#each NIGERIAN_STATES as state (state)}
											<option value={state}>{state} State</option>
										{/each}
									</select>
								</label>
								<span class="col-span-2 block font-code text-[11px] tracking-[0.08em] text-on-surface-variant pt-0.5 truncate">{venue || 'Venue TBA'} • {city || 'City not set'} • 6.4253° N, 3.4219° E</span>
							</div>
							<button type="button" onclick={() => toast('Coordinate calibration locked to venue node', 'info')} class="{MONO} text-on-surface underline underline-offset-4 hover:text-primary shrink-0">Calibrate</button>
						</div>
						<div class="relative h-44 rounded-lg overflow-hidden border border-surface-glass-border bg-surface-container-low">
							<div
								class="absolute inset-0 opacity-60"
								style="background-image: linear-gradient(rgba(192,193,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(192,193,255,0.07) 1px, transparent 1px), radial-gradient(circle at 70% 30%, rgba(76,215,246,0.12) 0, transparent 45%); background-size: 28px 28px, 28px 28px, 100% 100%;"
							></div>
							<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
								<span class="absolute -inset-4 rounded-full border border-primary/30 animate-ping"></span>
								<span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center">
									<MapPin class="w-4 h-4" />
								</span>
							</div>
							<span class="{MONO} absolute top-3 left-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded">GPS: 6.4253° N, 3.4219° E</span>
							<span class="{MONO} absolute top-3 right-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded flex items-center gap-1.5">
								<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Live Radar Locked
							</span>
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<span class="{MONO} text-on-surface-variant flex items-center justify-between">
							<span>Keyframe Artwork / 16:9 Banner</span>
							<span class="normal-case tracking-normal font-code text-[11px]">Required Aspect Ratio 1280x720</span>
						</span>
						{#if coverUrl}
						<div class="rounded-lg border border-surface-glass-border bg-surface-container-low overflow-hidden">
							<img src={coverUrl} alt="Event cover preview" class="w-full h-56 object-cover" />
							<div class="flex items-center justify-between gap-3 px-4 py-3 bg-surface-base border-t border-surface-glass-border">
								<span class="text-body-sm text-on-surface truncate">{coverName}</span>
								<span class="flex items-center gap-2">
									<label class="h-9 px-3 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 cursor-pointer hover:border-primary/40">
										<CloudUpload class="w-4 h-4" /> Replace
										<input type="file" aria-label="Upload event poster" accept="image/jpeg,image/png,image/webp" class="sr-only" onchange={handleCoverSelect} />
									</label>
									<button type="button" onclick={clearCover} class="h-9 px-3 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm text-on-surface-variant hover:text-error">Remove</button>
								</span>
							</div>
						</div>
						{:else}
						<label class="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container-low p-10 flex flex-col items-center gap-3 hover:border-primary/40 transition-colors cursor-pointer">
							<span class="w-12 h-12 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface-variant flex items-center justify-center">
								<CloudUpload class="w-5 h-5" />
							</span>
							<span class="text-body-md font-semibold text-on-surface">Drag and drop key visual asset here</span>
							<span class="text-body-sm text-on-surface-variant">Supports JPEG, PNG, or WEBP up to 12MB. Cropped to 16:9 before publishing.</span>
							<span class="flex items-center gap-2 pt-1">
								<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">16:9 Auto-Crop</span>
								<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">Metadata Encrypted</span>
							</span>
							<input type="file" aria-label="Upload event poster" accept="image/jpeg,image/png,image/webp" class="sr-only" onchange={handleCoverSelect} />
						</label>
						{/if}
						{#if coverError}<p class="text-body-sm text-error" role="alert">{coverError}</p>{/if}
					</div>
				</section>
				{:else if step === 2}
				<!-- BLOCK B -->
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6 xl:p-7 flex flex-col gap-5">
					<div class="flex items-center justify-between gap-4">
						<span class="flex items-center gap-3 min-w-0">
							<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface px-2 py-0.5 rounded shrink-0">Block B</span>
							<h2 class="font-display text-headline-md text-on-surface truncate">Ticket Tiers &amp; Smart Issuance</h2>
						</span>
						<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2.5 py-1 rounded shrink-0">Currency: NGN ₦ Locked</span>
					</div>

					{#each tiers as tier, i (i)}
						<div class="rounded-lg border border-surface-glass-border bg-surface-container-low p-5 flex flex-col gap-3">
							{#if tier.editing}
								<div class="grid grid-cols-2 gap-3">
									<label class="col-span-2 flex flex-col gap-1 {MONO} text-on-surface-variant">
										Tier name
										<input type="text" bind:value={tier.name} class="px-3 h-10 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
									</label>
									<label class="flex flex-col gap-1 {MONO} text-on-surface-variant">
										Price (₦)
										<input type="number" min="0" bind:value={tier.price} class="px-3 h-10 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
									</label>
									<label class="flex flex-col gap-1 {MONO} text-on-surface-variant">
										Capacity
										<input type="number" min="1" bind:value={tier.capacity} class="px-3 h-10 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
									</label>
									<label class="col-span-2 flex flex-col gap-1 {MONO} text-on-surface-variant">
										Benefits (optional)
										<input type="text" bind:value={tier.benefits} class="px-3 h-10 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
									</label>
								</div>
								<button class="self-end h-9 px-4 rounded-lg bg-primary text-on-primary text-body-sm font-semibold" onclick={() => (tier.editing = false)}>Done</button>
							{:else}
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0">
										<span class="flex items-center gap-2 min-w-0">
											<span class="text-body-lg font-semibold text-on-surface truncate">{tier.name}</span>
											<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded shrink-0">Tier {String(i + 1).padStart(2, '0')}</span>
										</span>
										<p class="text-body-sm text-on-surface-variant pt-1">{tier.benefits || 'Standard gate access for this credential class.'}</p>
									</div>
									<div class="text-right shrink-0">
										<span class="font-display text-headline-lg text-on-surface block">{tier.price === 0 ? '₦0 (Free)' : formatMoney(tier.price)}</span>
										<span class="{MONO} text-on-surface-variant">{tier.price === 0 ? 'Invite Gated' : 'Per Pass'}</span>
									</div>
								</div>
								<div class="grid grid-cols-2 xl:grid-cols-4 gap-4 border-t border-surface-glass-border pt-3">
									<div>
										<span class="{MONO} text-on-surface-variant block">Capacity Allotment</span>
										<span class="text-body-md font-semibold text-on-surface block pt-1">{tier.capacity.toLocaleString()} Passes</span>
									</div>
									<div>
										<span class="{MONO} text-on-surface-variant block">{tier.price >= 50000 ? 'Fast-Pass NFC' : 'Transfer Policy'}</span>
										<span class="text-body-md font-semibold text-on-surface block pt-1">{tier.price >= 50000 ? 'Active Turnstile' : 'P2P Enabled'}</span>
									</div>
									<div>
										<span class="{MONO} text-on-surface-variant block">Gross Cap</span>
										<span class="text-body-md font-semibold text-on-surface block pt-1">{tier.price === 0 ? '₦0 (Complimentary)' : formatMoney(tier.price * tier.capacity)}</span>
									</div>
									<div class="flex flex-col items-start xl:items-end gap-2">
										<span
											class="{MONO} px-2 py-0.5 rounded border
												{tier.price === 0
													? 'bg-surface-container-high border-surface-glass-border text-on-surface-variant'
													: i % 2 === 1
														? 'bg-surface-container-high border-surface-glass-border text-on-surface-variant'
														: 'bg-primary text-on-primary border-primary'}"
										>
											{tier.price === 0 ? 'Whitelisted' : i % 2 === 1 ? 'Reserved 45%' : 'Available'}
										</span>
										<span class="flex items-center gap-1">
											<button aria-label="Edit tier" type="button" class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors" onclick={() => (tier.editing = true)}>
												<Pencil class="w-3.5 h-3.5" />
											</button>
											<button aria-label="Delete tier" type="button" class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center justify-center text-on-surface-variant hover:text-error transition-colors" onclick={() => (tiers = tiers.filter((_, j) => j !== i))}>
												<Trash2 class="w-3.5 h-3.5" />
											</button>
										</span>
									</div>
								</div>
							{/if}
						</div>
					{/each}
					<button type="button" onclick={addTier} class="h-12 rounded-lg border border-dashed border-outline-variant/60 text-on-surface-variant text-body-md font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors">
						<Plus class="w-4 h-4" /> + Add Another Ticket Tier (e.g. Student, Early Bird Round 2)
					</button>
					<!-- Promo Codes — under Tickets & Pricing -->
					<div class="rounded-lg border border-surface-glass-border bg-surface-container-low p-5 flex flex-col gap-4">
						<div class="flex items-center justify-between gap-3">
							<span class="flex items-center gap-2.5">
								<Tag class="w-4.5 h-4.5 text-primary" />
								<span class="font-display text-body-lg font-semibold text-on-surface">Promo Codes</span>
								<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded text-[10px]">Early Bird Engine</span>
							</span>
							<span class="{MONO} text-on-surface-variant">{activePromoCount} Active</span>
						</div>
						<p class="text-body-sm text-on-surface-variant">Reward early supporters with a limited promo. Eg: <span class="font-semibold text-on-surface">Owltside — 5% off — first 50 people</span>.</p>
						<div class="grid grid-cols-[1.4fr_0.6fr_0.8fr_auto] gap-3 items-end">
							<label class="flex flex-col gap-1.5 {MONO} text-on-surface-variant">
								Promo code
								<input type="text" placeholder="Owltside" bind:value={promoCode} maxlength="24" class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
							</label>
							<label class="flex flex-col gap-1.5 {MONO} text-on-surface-variant">
								% off
								<span class="relative flex items-center">
									<input type="number" inputmode="numeric" min="1" max="100" placeholder="5" bind:value={promoPercent} class="w-full h-11 pl-3 pr-7 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
									<Percent class="w-3.5 h-3.5 text-on-surface-variant absolute right-2.5 pointer-events-none" />
								</span>
							</label>
							<label class="flex flex-col gap-1.5 {MONO} text-on-surface-variant">
								No. of purchases
								<input type="number" inputmode="numeric" min="1" placeholder="50" bind:value={promoMax} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
							</label>
							<button type="button" onclick={addPromo} class="h-11 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors glow-primary shrink-0">
								<Plus class="w-4 h-4" /> Add
							</button>
						</div>
						{#if promoError}
							<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2" role="alert">{promoError}</p>
						{/if}
						{#if promos.length}
							<div class="flex flex-col gap-2">
								{#each promos as promo, idx (promo.code)}
									<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-base px-3 py-2.5">
										<span class="flex items-center gap-2 min-w-0">
											<span class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0"><Tag class="w-3.5 h-3.5" /></span>
											<span class="min-w-0">
												<span class="block text-body-sm font-semibold text-on-surface truncate">{promo.code} — {promo.percent}% off — first {promo.maxUses} people</span>
												<span class="block text-xs text-on-surface-variant">{promo.percent}% discount • {promo.uses ?? 0} of {promo.maxUses} redeemed</span>
											</span>
										</span>
										<span class="flex items-center gap-2 shrink-0">
											<span class="{MONO} px-2 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20">{(promo.uses ?? 0) >= promo.maxUses ? 'Used up' : 'Active'}</span>
											<button type="button" aria-label="Remove {promo.code}" onclick={() => removePromo(idx)} class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"><Trash2 class="w-3.5 h-3.5" /></button>
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-body-sm text-on-surface-variant rounded-lg bg-surface-base border border-dashed border-surface-glass-border px-3 py-3">No promo codes yet. Add one above — e.g. <span class="font-semibold text-on-surface">Owltside</span> for <span class="font-semibold text-on-surface">5% off</span> the first <span class="font-semibold text-on-surface">50</span> purchases.</p>
						{/if}
					</div>
				</section>
				{/if}
			</div>

			<!-- right rail: live feed simulation -->
			<aside class="flex flex-col gap-5 min-w-0">
				<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
					<div class="flex items-center justify-between gap-3 px-5 pt-4">
						<span class="flex items-center gap-2">
							<span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
							<span class="{MONO} text-on-surface">Live Feed Simulation</span>
						</span>
						<span class="{MONO} text-on-surface-variant">Render: 720p Desktop Node</span>
					</div>
					<div class="p-5 flex flex-col gap-5">
						<div class="relative rounded-lg overflow-hidden border border-surface-glass-border">
							{#if coverUrl}
							<img src={coverUrl} alt="Event cover preview" class="w-full h-44 object-cover" />
							{:else}
							<Cover cover={demoCover} class="w-full h-44" iconClass="w-12 h-12 text-white/30" />
							{/if}
							<div class="absolute top-3 left-3 flex items-center gap-2">
								<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{categoryLabel || 'Category'}</span>
								<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{city || 'City'} WAT</span>
							</div>
							<div class="absolute top-3 right-3 hidden xl:flex flex-col gap-1 w-40 rounded-lg border border-surface-glass-border bg-surface-base/85 backdrop-blur-md p-2.5">
								<span class="{MONO} text-on-surface-variant">Event Title</span>
								<span class="text-[11px] text-on-surface truncate">{title || 'Untitled node'}</span>
								<span class="{MONO} text-on-surface-variant pt-1">Date &amp; Time</span>
								<span class="text-[11px] text-on-surface">{date ? fmtDate(date) : 'Date TBA'} → {dateEnd ? fmtDate(dateEnd) : 'Date TBA'}</span>
								<span class="{MONO} text-on-surface-variant pt-1">Capacity</span>
								<span class="text-[11px] text-on-surface">{totalCapacity.toLocaleString()} slots</span>
							</div>
						</div>
						<div>
							<h3 class="font-display text-headline-md text-on-surface leading-tight">{title || 'Untitled node'}</h3>
							<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant pt-1 min-w-0">
								<MapPin class="w-3.5 h-3.5 shrink-0" />
								<span class="truncate">{venue || 'Venue TBA'}, {city} • {date ? fmtDate(date) : 'Date TBA'}–{dateEnd ? fmtDate(dateEnd) : 'Date TBA'}</span>
							</span>
						</div>
						<div class="flex items-end justify-between gap-4 border-t border-surface-glass-border pt-4">
							<div>
								<span class="{MONO} text-on-surface-variant block">Starting From</span>
								<span class="font-display text-headline-lg text-on-surface font-bold block pt-1">{minTierPrice === 0 ? 'Free' : formatMoney(minTierPrice)}</span>
							</div>
							<div class="text-right">
								<span class="{MONO} text-on-surface-variant block">Aggregate Capacity</span>
								<span class="text-body-md font-semibold text-on-surface block pt-1">{totalCapacity.toLocaleString()} Available Slots</span>
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between gap-3">
								<span class="text-body-sm text-on-surface-variant">Calculated Max Potential Gross</span>
								<span class="font-code text-body-md font-bold text-on-surface">{formatMoney(totalGross)}</span>
							</div>
							<div class="flex h-1.5 rounded-full overflow-hidden bg-surface-container-high mt-2">
								{#each tiers as tier, i (i)}
									<div
										class="h-full {i % 3 === 0 ? 'bg-primary' : i % 3 === 1 ? 'bg-primary-container' : 'bg-tertiary'}"
										style="width: {totalGross > 0 ? ((tier.price * tier.capacity) / totalGross) * 100 : 0}%"
									></div>
								{/each}
							</div>
							<div class="grid grid-cols-3 gap-2 pt-2">
								{#each [0, 1, 2] as i (i)}
									<span class="{MONO} text-on-surface-variant truncate {i === 1 ? 'text-center' : i === 2 ? 'text-right' : ''}">
										{tiers[i] ? `${tiers[i].name.split(' ')[0]} (${millions(tiers[i].price * tiers[i].capacity)})` : 'Sponsor Expansion'}
									</span>
								{/each}
							</div>
						</div>
						<div class="border-t border-surface-glass-border pt-4 flex flex-col gap-4">
							<span class="{MONO} text-on-surface-variant">Settlement &amp; Payout Terms</span>
							{#each [
								{ icon: BadgeCheck, title: 'Zero Upfront Listing Fee', sub: 'You only pay when attendees finalize checkouts. No recurring server charge.' },
								{ icon: Landmark, title: '3% Automatic Paystack Deduction', sub: 'Settled to your verified Nigerian corporate bank account within T+1 rolling hours.' },
								{ icon: ShieldCheck, title: 'Cryptographic Turnstile Signature', sub: 'Anti-scalping non-fungible proof generated on every successful transaction.' }
							] as row (row.title)}
								<div class="flex gap-3">
									<row.icon class="w-4 h-4 text-primary shrink-0 mt-0.5" />
									<div class="min-w-0">
										<span class="text-body-md font-semibold text-on-surface block">{row.title}</span>
										<span class="text-body-sm text-on-surface-variant block pt-0.5">{row.sub}</span>
									</div>
								</div>
							{/each}
						</div>
						<div class="border-t border-surface-glass-border pt-4">
							<div class="flex items-center justify-between gap-3">
								<span class="{MONO} text-on-surface-variant">Projected Sales Velocity</span>
								<span class="{MONO} text-on-surface">85% Absorption in 72h</span>
							</div>
							<svg viewBox="0 0 300 60" class="w-full h-16 pt-2" aria-hidden="true">
								<polygon points="0,52 40,48 80,45 120,38 160,30 200,25 240,16 300,8 300,60 0,60" fill="rgba(99,102,241,0.12)" />
								<polyline points="0,52 40,48 80,45 120,38 160,30 200,25 240,16 300,8" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" />
							</svg>
						</div>
					</div>
				</div>
			</aside>
		</div>

		<!-- sticky action bar -->
		<div class="sticky bottom-0 z-40 mt-8 border-t border-surface-glass-border bg-surface-base/90 backdrop-blur-xl">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-3 flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-4">
					{#if step === 1}
						<button type="button" onclick={() => { saveDraft(); back(); }} class="h-11 px-4 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors">
							<ArrowLeft class="w-4 h-4" /> Save &amp; Exit Draft
						</button>
					{:else}
						<button type="button" onclick={() => { step = 1; scrollTo({ top: 0 }); }} class="h-11 px-4 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors">
							<ArrowLeft class="w-4 h-4" /> Back: Basics &amp; Venue
						</button>
					{/if}
					<span class="{MONO} text-on-surface-variant hidden lg:block">Next auto-sync in 18s</span>
				</div>
				<div class="flex items-center gap-5">
					<div class="hidden md:flex flex-col items-end leading-tight">
						{#if step === 1}
							<span class="{MONO} text-on-surface">Step 01 of 05</span>
							<span class="text-body-sm text-on-surface-variant pt-0.5">Essentials &amp; Space · {title ? title.slice(0,24) : 'Untitled'}</span>
						{:else}
							<span class="{MONO} text-on-surface">Step 02 of 05 completed</span>
							<span class="text-body-sm text-on-surface-variant pt-0.5">Tickets configured: {tiers.length} Tiers ({totalCapacity.toLocaleString()} Total Slots)</span>
						{/if}
					</div>
					{#if step === 1}
						<button
							type="button"
							disabled={!canContinue}
							onclick={() => { step = 2; scrollTo({ top: 0 }); }}
							class="h-11 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors glow-primary disabled:opacity-40"
						>
							<span>Next: Step 2 – Tickets &amp; Pools</span>
							<ArrowRight class="w-4 h-4" />
						</button>
					{:else}
						<button
							type="button"
							disabled={!canContinue}
							onclick={() => { step = 3; scrollTo({ top: 0 }); }}
							class="h-11 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors glow-primary disabled:opacity-40"
						>
							<span>Next: Step 3 – Schedule &amp; Lineup</span>
							<ArrowRight class="w-4 h-4" />
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- footer -->
		<footer class="border-t border-surface-glass-border">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
				<span class="flex items-center gap-3">
					<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
					<span class="{MONO} text-on-surface-variant">Decentralized Event Protocol</span>
				</span>
				<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					Mainnet 99.98% Operational • Latency: 24ms
				</span>
				<span class="text-body-sm text-on-surface-variant">© {new Date().getFullYear()} OWLTSIDE Protocol. All rights reserved.</span>
			</div>
		</footer>
	</div>
{/if}

<!-- ── desktop (md+) "Execution Matrix & Gate Hardware" — step 3 only ── -->
{#if step === 3}
	<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
		<!-- protocol configuration sub-header -->
		<div class="border-b border-surface-glass-border bg-surface-container-low/60">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-5 flex flex-col gap-4">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<span class="flex items-center gap-3 min-w-0">
						<span class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface flex items-center justify-center shrink-0">
							<SlidersHorizontal class="w-4 h-4" />
						</span>
						<span class="min-w-0">
							<span class="{MONO} text-on-surface-variant block truncate">Protocol Configuration / Draft_EVT_NEW</span>
							<span class="font-display text-headline-md text-on-surface block truncate">Execution Matrix &amp; Gate Hardware</span>
						</span>
					</span>
					<span class="{MONO} text-on-surface-variant hidden xl:block">Auto-synced</span>
				</div>
				<!-- stepper (image design) -->
				<div class="grid grid-cols-5 gap-3">
					{#each ([
					[1, 'Basics & Venue', venue ? venue.slice(0, 18) : 'No venue yet'],
					[2, 'Tickets & Pools', `${tiers.length} Tiers\u00B7${tiers.reduce((s, tt) => s + (Number(tt.capacity) || 0), 0)} Cap`],
					[3, 'Schedule & Lineup', `${days.reduce((s, d) => s + d.sessions.length, 0)} Sessions Pinned`],
					[4, 'Gate Infrastructure', `HMAC 30s\u00B7${gates.reduce((s, g) => s + Number(g.staff ?? 1), 0)} Scanners`],
					[5, 'Review & Deploy', validated ? '100% Validated' : `${validatedCount}/${totalChecks} Checks`]
				] as [number, string, string][]) as [n, label, sub]}
					<button
						type="button"
						onclick={() => {
							step = n;
							scrollTo({ top: 0 });
						}}
						class="rounded-lg border p-3 flex flex-col gap-1 text-left transition-colors
							{n == step
								? 'border-primary/40 bg-surface-container-high'
								: n < step
									? 'border-accent-emerald/30 bg-surface-container'
									: 'border-transparent bg-surface-container/40 hover:bg-surface-container'}"
					>
						<span class="flex items-center gap-2.5">
							<span
								class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-code text-label-badge font-bold
									{n < step
										? 'bg-accent-emerald text-on-primary'
										: n == step
											? 'bg-primary text-on-primary'
											: 'bg-surface-container-high text-on-surface-variant'}"
							>
								{#if n < step}<Check class="w-3.5 h-3.5" />{:else}{String(n).padStart(2, '0')}{/if}
							</span>
							<span class="{MONO} text-on-surface-variant">Step {String(n).padStart(2, '0')}{n == step ? ' // Active' : n < step ? ' ✓' : ''}</span>
						</span>
						<span class="text-body-sm font-semibold text-on-surface truncate">{label}</span>
						<span class="font-code text-[11px] tracking-[0.08em] truncate {n == step ? 'text-primary' : n < step ? 'text-accent-emerald' : 'text-on-surface-variant'}">{sub}{n === 5 && Number(step) === 5 && validated ? ' \u00B7 LAUNCH READY' : ''}</span>
					</button>
				{/each}
				</div>
			</div>
		</div>

		<!-- main grid -->
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8 grid gap-8 xl:gap-10 items-start">
<section class="flex flex-col gap-6 min-w-0">
				<div class="flex items-end justify-between gap-4">
					<div>
						<span class="{MONO} text-on-surface-variant">Step 03 Component</span>
						<h1 class="font-display text-headline-lg md:text-[30px] leading-tight text-on-surface pt-2">Program &amp; Lineup Architecture</h1>
					</div>
					<span class="{MONO} bg-surface-container border border-surface-glass-border text-on-surface px-2.5 py-1 rounded mb-1 shrink-0">{days.length} Days Confirmed</span>
				</div>

				<!-- day tabs -->
				<div class="grid grid-cols-2 xl:grid-cols-3 gap-2">
					{#each days as d, i (d.label)}
						<button
							type="button"
							onclick={() => (dayIdx = i)}
							class="rounded-lg border p-3.5 text-left transition-colors
								{i === dayIdx
									? 'border-surface-glass-border bg-surface-container-high'
									: 'border-transparent bg-surface-container/50 hover:bg-surface-container'}"
						>
							<span class="{MONO} text-on-surface-variant block">{d.label}</span>
							<span class="text-body-sm font-semibold text-on-surface truncate block pt-1">Day {i + 1}: {d.sessions[0]?.title ?? 'Unscheduled'}</span>
						</button>
					{/each}
					<button type="button" onclick={addDay} class="rounded-lg border border-dashed border-outline-variant/60 p-3.5 text-left text-on-surface-variant hover:text-primary hover:border-primary transition-colors flex items-center gap-2">
						<Plus class="w-4 h-4" /> <span class="text-body-sm font-medium">+ Day</span>
					</button>
				</div>

				<div class="flex items-center justify-between gap-4">
					<span class="{MONO} text-on-surface-variant">Runtime Schedule Flow</span>
					<span class="{MONO} text-on-surface-variant hidden sm:block">Auto-syncs with Attendee PWA</span>
				</div>

				<!-- sessions -->
				{#if days.length && days[dayIdx]}
				{#each days[dayIdx].sessions as s, i (i)}
					<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-3">
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-code text-body-md font-bold text-on-surface">{s.time}</span>
							<input type="text" bind:value={s.stage} aria-label="Room or stage for {s.title}" class="max-w-56 px-2 py-1 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant {MONO} focus:outline-none focus:border-primary/50" />
							<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">{sessionTypes[i % sessionTypes.length]}</span>
							<button
								type="button"
								aria-label="Remove session"
								onclick={() => (days[dayIdx].sessions = days[dayIdx].sessions.filter((_, j) => j !== i))}
								class="ml-auto w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
							>
								<Trash2 class="w-3.5 h-3.5" />
							</button>
						</div>
						<div>
							<h3 class="font-display text-headline-md text-on-surface leading-tight">{s.title}</h3>
							<p class="text-body-sm text-on-surface-variant pt-1">{sessionDesc[i % sessionDesc.length]}</p>
						</div>
						{#if roster.length}
							{@const speaker = roster[i % roster.length]}
							<div class="rounded-lg bg-surface-base border border-surface-glass-border px-4 py-3 flex items-center gap-3"><Avatar name={speaker.name} src={speaker.avatarUrl} color={speaker.avatarColor} size="xs" /><span class="text-body-md font-semibold text-on-surface">{speaker.name}</span><span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant">• {speaker.role}</span></div>
						{:else}<p class="text-body-sm text-on-surface-variant">Speakers can be added below.</p>{/if}
					</div>
				{:else}
					<p class="text-body-sm text-on-surface-variant rounded-xl border border-dashed border-outline-variant/50 p-6">No sessions on this day yet — add the first block below.</p>
				{/each}
				{:else}
					<p class="text-body-sm text-on-surface-variant rounded-xl border border-dashed border-outline-variant/50 p-6">No days yet — add a day to schedule sessions.</p>
				{/if}

				{#if showComposer}
					<div class="rounded-xl border border-surface-glass-border bg-surface-container-low p-5 grid grid-cols-[110px_1fr] gap-3">
						<input type="time" bind:value={newSession.time} class="px-3 h-11 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
						<input type="text" bind:value={newSession.title} placeholder="Session title" class="px-3 h-11 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
						<input type="text" bind:value={newSession.stage} placeholder="Room or stage name" aria-label="Room or stage name" class="col-span-2 px-3 h-11 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50" />
						<button type="button" onclick={addSession} class="col-span-2 h-11 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center gap-2 glow-primary">
							<Plus class="w-4 h-4" /> Add session
						</button>
					</div>
				{/if}
				<button type="button" onclick={() => (showComposer = !showComposer)} class="h-12 rounded-lg border border-surface-glass-border bg-surface-container/60 text-on-surface-variant text-body-md font-medium flex items-center justify-center gap-2 hover:border-primary/40 hover:text-on-surface transition-colors">
					<Plus class="w-4 h-4" /> Add Session / Workshop Block
				</button>

				<!-- roster -->
				<div class="flex flex-col gap-4 pt-2">
					<div class="flex items-end justify-between gap-4">
						<div>
							<h2 class="font-display text-headline-lg text-on-surface">Speaker/Performer</h2>
							<p class="text-body-sm text-on-surface-variant pt-1">Add verified Owltside profiles to queue invitations, or list performers by name only.</p>
						</div>
						<button type="button" onclick={openInviteDialog} class="h-10 px-4 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors shrink-0">
							<UserPlus class="w-4 h-4" /> Invite
						</button>
					</div>
					<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
						{#each roster as person (person.id ?? person.name)}
							<div class="rounded-xl border border-surface-glass-border bg-surface-container p-4 flex flex-col gap-3">
								<div class="flex items-center gap-3 min-w-0"><Avatar name={person.name} color={person.avatarColor} src={person.avatarUrl} size="md" /><div class="min-w-0 flex-1"><span class="text-body-md font-semibold text-on-surface block truncate">{person.name}</span><span class="text-body-sm text-on-surface-variant block truncate">{person.role}</span></div><button type="button" aria-label="Remove {person.name}" onclick={() => removeSpeaker(person)} class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-container-high"><X class="w-4 h-4" /></button></div>
								{#if person.bio}<p class="text-body-sm text-on-surface-variant line-clamp-2">{person.bio}</p>{/if}
								<span class="self-start {MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">{person.invited ? `Invite pending · @${person.handle}` : 'Display only'}</span>
							</div>
						{:else}
							<p class="col-span-full rounded-xl border border-dashed border-outline-variant/50 p-6 text-body-sm text-on-surface-variant">No speakers or performers added yet. Use Invite to add an Owltside profile or a display-only name.</p>
						{/each}
					</div>
				</div>
			</section>

			
		</div>

		<!-- sticky action bar -->
		<div class="sticky bottom-0 z-40 mt-8 border-t border-surface-glass-border bg-surface-base/90 backdrop-blur-xl">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-3 flex flex-wrap items-center justify-between gap-4">
				<button
					type="button"
					onclick={() => {
						step = 2;
						scrollTo({ top: 0 });
					}}
					class="h-11 px-4 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors"
				>
					<ArrowLeft class="w-4 h-4" /> Back to Tickets &amp; Pools
				</button>
				<div class="flex items-center gap-5">
					<div class="hidden md:flex flex-col items-end leading-tight">
						<span class="{MONO} text-on-surface">Step 03 · Schedule &amp; Lineup</span>
						<span class="text-body-sm text-on-surface-variant pt-0.5">{days.reduce((s, d) => s + d.sessions.length, 0)} Sessions pinned · {roster.length} Speakers</span>
					</div>
					<button
						type="button"
						onclick={() => {
							step = 4;
							scrollTo({ top: 0 });
						}}
						class="h-11 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors glow-primary"
					>
						<span>Next: Step 4 — Gate Infrastructure</span>
						<ArrowRight class="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>

		<!-- footer -->
		<footer class="border-t border-surface-glass-border">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
				<span class="flex items-center gap-3">
					<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
					<span class="{MONO} text-on-surface-variant">Decentralized Event Protocol</span>
				</span>
				<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					Mainnet 99.98% Operational • Latency: 24ms
				</span>
				<span class="text-body-sm text-on-surface-variant">© {new Date().getFullYear()} OWLTSIDE Protocol. All rights reserved.</span>
			</div>
		</footer>
	</div>
{/if}

<!-- ── desktop (md+) "Gate Infrastructure" — step 4 only ── -->
{#if step === 4}
	<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">


		<!-- protocol configuration sub-header -->
		<div class="border-b border-surface-glass-border bg-surface-container-low/60">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-5 flex flex-col gap-4">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<span class="flex items-center gap-3 min-w-0">
						<span class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface flex items-center justify-center shrink-0">
							<SlidersHorizontal class="w-4 h-4" />
						</span>
						<span class="min-w-0">
							<span class="{MONO} text-on-surface-variant block truncate">Protocol Configuration / Draft_EVT_NEW</span>
							<span class="font-display text-headline-md text-on-surface block truncate">Execution Matrix &amp; Gate Hardware</span>
						</span>
					</span>
					<span class="{MONO} text-on-surface-variant hidden xl:block">Auto-synced</span>
				</div>
				<!-- stepper (image design) -->
				<div class="grid grid-cols-5 gap-3">
					{#each ([
					[1, 'Basics & Venue', venue ? venue.slice(0, 18) : 'No venue yet'],
					[2, 'Tickets & Pools', `${tiers.length} Tiers\u00B7${tiers.reduce((s, tt) => s + (Number(tt.capacity) || 0), 0)} Cap`],
					[3, 'Schedule & Lineup', `${days.reduce((s, d) => s + d.sessions.length, 0)} Sessions Pinned`],
					[4, 'Gate Infrastructure', `HMAC 30s\u00B7${gates.reduce((s, g) => s + Number(g.staff ?? 1), 0)} Scanners`],
					[5, 'Review & Deploy', validated ? '100% Validated' : `${validatedCount}/${totalChecks} Checks`]
				] as [number, string, string][]) as [n, label, sub]}
					<button
						type="button"
						onclick={() => {
							step = n;
							scrollTo({ top: 0 });
						}}
						class="rounded-lg border p-3 flex flex-col gap-1 text-left transition-colors
							{n == step
								? 'border-primary/40 bg-surface-container-high'
								: n < step
									? 'border-accent-emerald/30 bg-surface-container'
									: 'border-transparent bg-surface-container/40 hover:bg-surface-container'}"
					>
						<span class="flex items-center gap-2.5">
							<span
								class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-code text-label-badge font-bold
									{n < step
										? 'bg-accent-emerald text-on-primary'
										: n == step
											? 'bg-primary text-on-primary'
											: 'bg-surface-container-high text-on-surface-variant'}"
							>
								{#if n < step}<Check class="w-3.5 h-3.5" />{:else}{String(n).padStart(2, '0')}{/if}
							</span>
							<span class="{MONO} text-on-surface-variant">Step {String(n).padStart(2, '0')}{n == step ? ' // Active' : n < step ? ' ✓' : ''}</span>
						</span>
						<span class="text-body-sm font-semibold text-on-surface truncate">{label}</span>
						<span class="font-code text-[11px] tracking-[0.08em] truncate {n == step ? 'text-primary' : n < step ? 'text-accent-emerald' : 'text-on-surface-variant'}">{sub}{n === 5 && Number(step) === 5 && validated ? ' \u00B7 LAUNCH READY' : ''}</span>
					</button>
				{/each}
				</div>
			</div>
		</div>

		<!-- main grid -->
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8 grid gap-8 xl:gap-10 items-start">
<section class="flex flex-col gap-6 min-w-0">
				<div class="flex items-end justify-between gap-4">
					<div>
						<span class="{MONO} text-on-surface-variant">Step 04 Component</span>
						<h1 class="font-display text-headline-lg md:text-[30px] leading-tight text-on-surface pt-2">Gate &amp; Security Topology</h1>
					</div>

				</div>

				<!-- gate nodes -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3">
						<span class="flex items-center gap-2.5">
							<Smartphone class="w-4.5 h-4.5 text-primary" />
							<span class="font-display text-headline-md text-on-surface">Physical Gate Nodes</span>
						</span>
						<span class="{MONO} text-on-surface-variant">{gates.length} Active Gates</span>
					</div>
					{#each gates as gate, i (i)}
						<div class="rounded-lg border border-surface-glass-border bg-surface-container-low p-4 flex flex-col gap-3">
							<div class="flex items-center justify-between gap-3">
								<span class="flex items-center gap-2 min-w-0">
									<span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
									<span class="text-body-md font-semibold text-on-surface truncate">Gate {String(i + 1).padStart(2, '0')}: {gate.name}</span>
								</span>
								<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded shrink-0">{gate.staff} Scanners</span>
							</div>
							<p class="text-body-sm text-on-surface-variant">{gateSubs[i % gateSubs.length]}</p>
							{#if gateEdit === i}
								<div class="flex items-center gap-2 rounded-lg bg-surface-base border border-surface-glass-border px-3 py-2">
									<input aria-label="Gate name" bind:value={gate.name} placeholder="Gate name" class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-container-low border border-surface-glass-border text-body-sm text-on-surface focus:outline-none focus:border-primary/50" />
									<button type="button" class="h-9 px-4 rounded-lg bg-primary text-on-primary text-body-sm font-semibold shrink-0" onclick={() => (gateEdit = -1)}>Done</button>
								</div>
							{/if}
							<div class="flex items-center justify-between gap-3">
								<span class="flex items-center gap-1.5 font-code text-[11px] tracking-[0.08em] text-on-surface-variant">
									{#if i === 0}
										<Zap class="w-3.5 h-3.5 text-accent-amber" /> Est. Capacity: {(gate.staff * 450).toLocaleString()}/hr
									{:else}
										<ShieldCheck class="w-3.5 h-3.5 text-accent-emerald" /> Whitelisted Roles Only
									{/if}
								</span>
								<button type="button" onclick={() => (gateEdit = gateEdit === i ? -1 : i)} class="{MONO} text-on-surface underline underline-offset-4 hover:text-primary">edit</button>
							</div>
						</div>
					{/each}
					<button type="button" onclick={() => (gates = [...gates, { name: 'New Gate', staff: 2 }])} class="h-11 rounded-lg border border-surface-glass-border bg-surface-container-high/60 text-on-surface-variant text-body-sm font-medium flex items-center justify-center gap-2 hover:border-primary/40 hover:text-on-surface transition-colors">
						<Plus class="w-4 h-4" /> Add Entrance / Turnstile Node
					</button>
				</div>

				<!-- field scanner authentication -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3">
						<span class="flex items-center gap-2.5">
							<ScanLine class="w-4.5 h-4.5 text-primary" />
							<span class="font-display text-headline-md text-on-surface">Field Scanner Authentication</span>
						</span>
						<span class="{MONO} text-on-surface-variant">Temporary Token</span>
					</div>
					<div class="rounded-lg bg-surface-base border border-surface-glass-border p-4">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<span class="{MONO} text-on-surface-variant block">Turnstile Master PIN</span>
								<span class="font-code text-[28px] leading-tight tracking-[0.18em] text-on-surface block pt-1">8042-99</span>
								<span class="flex items-center gap-1.5 font-code text-[11px] tracking-[0.08em] text-on-surface-variant pt-1">
									<Clock class="w-3.5 h-3.5" /> Expires in 18h 42m (Revocable)
								</span>
							</div>
							<button type="button" onclick={copyPwaLink} class="h-10 px-3.5 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors shrink-0">
								<Copy class="w-4 h-4" /> Copy PWA Link
							</button>
						</div>
					</div>
					<span class="{MONO} text-on-surface-variant">Gatekeeper Authority Matrix</span>
					{#each [
						{ bind: 'allowOverride', title: 'Allow manual ticket override', sub: 'Supervisor PIN required for disputed ticket hashes' },
						{ bind: 'allowOffline', title: 'Allow offline scan cache sync', sub: 'Stores cryptographic verification proofs locally if WiFi drops' },
						{ bind: 'restrictGates', title: 'Restrict to assigned gates only', sub: 'Prevents VIP turnstile scanning at general admission entrances' }
					] as row (row.title)}
						<label class="rounded-lg border border-surface-glass-border bg-surface-container-low px-4 py-3 flex items-start gap-3 cursor-pointer">
							<input
								type="checkbox"
								class="accent-[#c0c1ff] w-4 h-4 mt-0.5"
								checked={row.bind === 'allowOverride' ? allowOverride : row.bind === 'allowOffline' ? allowOffline : restrictGates}
								onchange={() => {
									if (row.bind === 'allowOverride') allowOverride = !allowOverride;
									else if (row.bind === 'allowOffline') allowOffline = !allowOffline;
									else restrictGates = !restrictGates;
								}}
							/>
							<span class="min-w-0">
								<span class="text-body-md font-semibold text-on-surface block">{row.title}</span>
								<span class="text-body-sm text-on-surface-variant block pt-0.5">{row.sub}</span>
							</span>
						</label>
					{/each}
				</div>

				<!-- anti-fraud -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3">
						<span class="flex items-center gap-2.5">
							<ShieldCheck class="w-4.5 h-4.5 text-primary" />
							<span class="font-display text-headline-md text-on-surface">Anti-Fraud Safeguards</span>
						</span>
						<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">Zero-Knowledge</span>
					</div>
					{#each [
						{ key: 'hmac', title: 'Dynamic 30s HMAC QR Rotation', sub: 'Prevents ticket scalpers sharing screenshots or replays' },
						{ key: 'keyring', title: 'Offline Verification Keyring', sub: 'Pre-seed turnstiles with validator public keys for zero latency' },
						{ key: 'bio', title: 'Biometric Turnstile Fast-Pass', sub: 'Enables voluntary on-device zero-knowledge face hashing' }
					] as row (row.key)}
						<div class="rounded-lg border border-surface-glass-border bg-surface-container-low px-4 py-3 flex items-center justify-between gap-4">
							<span class="min-w-0">
								<span class="text-body-md font-semibold text-on-surface block">{row.title}</span>
								<span class="text-body-sm text-on-surface-variant block pt-0.5">{row.sub}</span>
							</span>
							<button
								type="button"
								role="switch"
								aria-label={row.title}
								aria-checked={row.key === 'hmac' ? hmacRotation : row.key === 'keyring' ? offlineKeyring : biometricFast}
								onclick={() => {
									if (row.key === 'hmac') hmacRotation = !hmacRotation;
									else if (row.key === 'keyring') offlineKeyring = !offlineKeyring;
									else biometricFast = !biometricFast;
								}}
								class="w-11 h-6 rounded-full relative shrink-0 transition-colors
									{row.key === 'hmac' ? (hmacRotation ? 'bg-primary' : 'bg-surface-container-highest') : row.key === 'keyring' ? (offlineKeyring ? 'bg-primary' : 'bg-surface-container-highest') : biometricFast ? 'bg-primary' : 'bg-surface-container-highest'}"
							>
								<span
									class="absolute top-0.5 w-5 h-5 rounded-full bg-surface-base transition-all
										{row.key === 'hmac' ? (hmacRotation ? 'left-[22px]' : 'left-0.5') : row.key === 'keyring' ? (offlineKeyring ? 'left-[22px]' : 'left-0.5') : biometricFast ? 'left-[22px]' : 'left-0.5'}"
								></span>
							</button>
						</div>
					{/each}
					<div class="flex flex-col gap-2 pt-1">
						<span class="{MONO} text-on-surface-variant">Duplicate Entry Conflict Policy</span>
						<div class="relative">
							<select bind:value={conflictPolicy} class="w-full h-11 appearance-none px-4 pr-10 rounded-lg bg-surface-container-low border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50">
								<option value="strict">Strict Rejection (Alert scanner &amp; log hardware timestamp)</option>
								<option value="quarantine">Quarantine Queue (Escort to concierge for re-verification)</option>
								<option value="warn">Soft Warn (Flag profile, allow entry, notify security)</option>
							</select>
							<ChevronDown class="w-4 h-4 text-on-surface-variant absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
						</div>
						<span class="text-body-sm text-on-surface-variant">Triggered if an already checked-in ticket ID attempts entry within 120 minutes.</span>
					</div>
				</div>
			</section>
		</div>

		<!-- sticky action bar -->
		<div class="sticky bottom-0 z-40 mt-8 border-t border-surface-glass-border bg-surface-base/90 backdrop-blur-xl">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-3 flex flex-wrap items-center justify-between gap-4">
				<button
					type="button"
					onclick={() => {
						step = 3;
						scrollTo({ top: 0 });
					}}
					class="h-11 px-4 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors"
				>
					<ArrowLeft class="w-4 h-4" /> Back to Schedule &amp; Lineup
				</button>
				<div class="flex items-center gap-5">
					<div class="hidden md:flex flex-col items-end leading-tight">
						<span class="{MONO} text-on-surface">Step 04 · Gate Infrastructure</span>
						<span class="text-body-sm text-on-surface-variant pt-0.5">{gates.length} Gates · {staffTotal} Scanners · HMAC 30s</span>
					</div>
					<button
						type="button"
						onclick={() => {
							step = 5;
							scrollTo({ top: 0 });
						}}
						class="h-11 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors glow-primary"
					>
						<span>Next: Step 5 — Review &amp; Launch</span>
						<ArrowRight class="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>

		<!-- footer -->
		<footer class="border-t border-surface-glass-border">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
				<span class="flex items-center gap-3">
					<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
					<span class="{MONO} text-on-surface-variant">Decentralized Event Protocol</span>
				</span>
				<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					Mainnet 99.98% Operational • Latency: 24ms
				</span>
				<span class="text-body-sm text-on-surface-variant">© {new Date().getFullYear()} OWLTSIDE Protocol. All rights reserved.</span>
			</div>
		</footer>
	</div>
{/if}

<!-- ── desktop (md+) "Review & Pre-Flight Clearance" — step 5 per the desktop
     design source, same theme tokens; publishes through the real ?/create action ── -->
{#if step === 5}
	<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
		<!-- top bar -->
		

		<!-- pre-flight sub-header -->
		<div class="border-b border-surface-glass-border bg-surface-container-low/60">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-wrap items-end justify-between gap-4">
				<div class="min-w-0">
					<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
						<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
						Production Wizard • V4.2
						<span class="text-outline-variant">/</span>
						Step 5 of 5
					</span>
					<h1 class="font-display text-headline-lg md:text-[34px] leading-tight text-on-surface pt-2">Review &amp; Pre-Flight Clearance</h1>
				</div>
				<div class="flex items-center gap-3 pb-1">
					<span class="h-9 px-3 rounded-lg bg-surface-container border border-surface-glass-border flex items-center gap-2 {MONO} text-on-surface">
						<Lock class="w-3.5 h-3.5 text-accent-emerald" /> HMAC Keygen Ready
					</span>
					<span class="h-9 px-3 rounded-lg bg-surface-container border border-surface-glass-border flex items-center gap-2 {MONO} text-on-surface">
						<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Pre-Flight Checks Passed
					</span>
				</div>
			</div>
			<!-- module stepper strip -->
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 grid grid-cols-2 lg:grid-cols-5 border-t border-surface-glass-border">
				{#each ([
					[1, '01', 'Basics & Venue', venue || 'Venue TBA'],
					[2, '02', 'Tickets & Pools', `${tiers.length} Tiers • ${totalCapacity.toLocaleString()} Cap`],
					[3, '03', 'Schedule & Lineup', `${sessionCount} Sessions Pinned`],
					[4, '04', 'Gate Infrastructure', `HMAC 30s • ${staffTotal} Scanners`],
					[5, '05', 'Review & Deploy', '100% Validated']
				] as [number, string, string, string][]) as [n, num, label, sub]}
					<button
						type="button"
						onclick={() => {
							if (n !== 5) {
								step = n;
								scrollTo({ top: 0 });
							}
						}}
						class="text-left px-4 py-4 border-b-2 transition-colors
							{n === 5
								? 'border-primary bg-surface-container-high'
								: 'border-transparent hover:bg-surface-container/60'} {n > 1 ? 'lg:border-l lg:border-l-surface-glass-border' : ''}"
					>
						<span class="flex items-center justify-between gap-2">
							<span class="font-code text-label-badge tracking-[0.14em] text-on-surface-variant">{num}</span>
							{#if n === 5}
								<span class="{MONO} bg-primary text-on-primary px-2 py-0.5 rounded">Launch Ready</span>
							{:else}
								<Check class="w-4 h-4 text-accent-emerald" />
							{/if}
						</span>
						<span class="text-body-md font-semibold text-on-surface block pt-2">{label}</span>
						<span class="text-body-sm text-on-surface-variant block pt-0.5 truncate">{sub}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- main grid -->
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8 grid lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_460px] gap-6 xl:gap-8 items-start">
			<!-- left column -->
			<section class="flex flex-col gap-6 min-w-0">
				<!-- hero -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
					<div class="relative">
						{#if coverUrl}
						<img src={coverUrl} alt="Event cover" class="w-full h-64 object-cover" />
						{:else}
						<Cover cover={demoCover} class="w-full h-64" iconClass="w-16 h-16 text-white/25" />
						{/if}
						<div class="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/20 to-transparent"></div>
						<div class="absolute top-4 left-4 flex items-center gap-2 flex-wrap">
							<span class="{MONO} bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded flex items-center gap-1.5">
								<BadgeCheck class="w-3.5 h-3.5 text-accent-emerald" /> Ready to Launch • ID: EVT-NEW
							</span>
							<span class="{MONO} bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded">Mainnet Protocol 1.4</span>
						</div>
						<div class="absolute inset-x-0 bottom-0 p-6">
							<span class="{MONO} text-tertiary">{(categoryLabel || 'Event').toUpperCase()} SUMMIT</span>
							<h2 class="font-display text-headline-lg md:text-[32px] leading-tight text-on-surface pt-2">{title || 'Untitled node'}</h2>
							<span class="flex flex-wrap items-center gap-4 pt-2 text-body-sm text-on-surface-variant">
								<span class="flex items-center gap-1.5"><CalendarDays class="w-4 h-4 text-primary" /> {date ? fmtDate(date) : 'Date TBA'} – {dateEnd ? fmtDate(dateEnd) : 'Date TBA'}</span>
								<span class="flex items-center gap-1.5 min-w-0"><MapPin class="w-4 h-4 text-primary shrink-0" /> <span class="truncate">{venue}, {city}</span></span>
							</span>
						</div>
					</div>
					<div class="grid grid-cols-3 border-t border-surface-glass-border bg-surface-base/60">
						<div class="flex flex-col items-center gap-1 py-4 px-2 text-center">
							<span class="{MONO} text-on-surface-variant">Total Max Cap</span>
							<span class="font-display text-headline-lg text-on-surface font-bold">{totalCapacity.toLocaleString()}</span>
							<span class="text-body-sm text-on-surface-variant">Guests Across {days.length} Days</span>
						</div>
						<div class="flex flex-col items-center gap-1 py-4 px-2 text-center border-x border-surface-glass-border">
							<span class="{MONO} text-on-surface-variant">Gross Revenue Cap</span>
							<span class="font-display text-headline-lg text-primary font-bold">{formatMoney(totalGross)}</span>
							<span class="text-body-sm text-on-surface-variant">Estimated Yield</span>
						</div>
						<div class="flex flex-col items-center gap-1 py-4 px-2 text-center">
							<span class="{MONO} text-on-surface-variant">Gate Security</span>
							<span class="font-display text-headline-lg text-on-surface font-bold">HMAC 30s</span>
							<span class="text-body-sm text-on-surface-variant">Anti-Screenshot</span>
						</div>
					</div>
				</div>

				<!-- audit banner -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex gap-4">
					<span class="w-11 h-11 rounded-lg bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center shrink-0">
						<ShieldCheck class="w-5 h-5" />
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="text-body-lg font-semibold text-on-surface">Pre-Flight Security Audit: PASSED</span>
							<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">0 Errors • 0 Bottlenecks</span>
						</div>
						<p class="text-body-sm text-on-surface-variant leading-relaxed pt-1.5">
							Zero conflicting agendas, venue occupancy limits match local Lagos State Safety Commission
							requirements, and cryptographic signature pools are generated with 256-bit encryption.
						</p>
					</div>
				</div>

				<!-- modules summary -->
				<div class="flex flex-col gap-4">
					<div class="flex items-end justify-between gap-4">
						<h2 class="font-display text-headline-lg text-on-surface">Configured Modules Summary</h2>
						<span class="{MONO} text-on-surface-variant hidden sm:block pb-1">Click edit to return to specific module</span>
					</div>

					<!-- module 1 -->
					<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
						<div class="flex items-center justify-between gap-3">
							<span class="flex items-center gap-3 min-w-0">
								<span class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border font-code text-label-badge text-on-surface flex items-center justify-center shrink-0">1</span>
								<span class="min-w-0">
									<span class="text-body-lg font-semibold text-on-surface block truncate">Basics, Branding &amp; Geolocation</span>
									<span class="text-body-sm text-on-surface-variant block pt-0.5">Physical Venue • {venue}, {city}</span>
								</span>
							</span>
							<button type="button" onclick={() => { step = 1; scrollTo({ top: 0 }); }} class="h-9 px-3.5 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors shrink-0">
								<Pencil class="w-3.5 h-3.5" /> Edit
							</button>
						</div>
						<div class="grid sm:grid-cols-3 gap-4 border-t border-surface-glass-border pt-4">
							<div>
								<span class="{MONO} text-on-surface-variant block">Event Title</span>
								<span class="text-body-md font-semibold text-on-surface block pt-1 truncate">{title || 'Untitled'}</span>
							</div>
							<div>
								<span class="{MONO} text-on-surface-variant block">Coordinates</span>
								<span class="font-code text-[12px] tracking-[0.06em] text-on-surface block pt-1.5">6.4253° N, 3.4219° E</span>
							</div>
							<div>
								<span class="{MONO} text-on-surface-variant block">Artwork Asset</span>
								<span class="text-body-md font-semibold text-on-surface block pt-1">16:9 4K Master Validated</span>
							</div>
						</div>
					</div>

					<!-- module 2 -->
					<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
						<div class="flex items-center justify-between gap-3">
							<span class="flex items-center gap-3 min-w-0">
								<span class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border font-code text-label-badge text-on-surface flex items-center justify-center shrink-0">2</span>
								<span class="min-w-0">
									<span class="text-body-lg font-semibold text-on-surface block truncate">Ticket Tiers &amp; Liquidity Pools</span>
									<span class="text-body-sm text-on-surface-variant block pt-0.5">{tiers.length} Smart Contract Pools Configured</span>
								</span>
							</span>
							<button type="button" onclick={() => { step = 2; scrollTo({ top: 0 }); }} class="h-9 px-3.5 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors shrink-0">
								<Pencil class="w-3.5 h-3.5" /> Edit
							</button>
						</div>
						<div class="flex flex-col gap-2 border-t border-surface-glass-border pt-4">
							{#each tiers as tier, i (i)}
								<div class="rounded-lg bg-surface-container-low border border-surface-glass-border px-4 py-3 flex flex-wrap items-center gap-3">
									<span class="text-body-md font-semibold text-on-surface">Tier {i + 1}: {tier.name}</span>
									{#if tier.benefits}
										<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">{tier.benefits}</span>
									{/if}
									<span class="ml-auto flex items-center gap-4">
										<span class="text-body-sm text-on-surface-variant">{tier.capacity.toLocaleString()} Qty</span>
										<span class="font-code text-body-md font-bold text-on-surface w-24 text-right">{tier.price === 0 ? 'Free' : formatMoney(tier.price)}</span>
									</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- module 3 -->
					<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
						<div class="flex items-center justify-between gap-3">
							<span class="flex items-center gap-3 min-w-0">
								<span class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border font-code text-label-badge text-on-surface flex items-center justify-center shrink-0">3</span>
								<span class="min-w-0">
									<span class="text-body-lg font-semibold text-on-surface block truncate">Curated Agenda &amp; Talent</span>
									<span class="text-body-sm text-on-surface-variant block pt-0.5">{days.length} Days • {sessionCount} Scheduled Sessions • {roster.length} Speakers/Performers</span>
								</span>
							</span>
							<button type="button" onclick={() => { step = 3; scrollTo({ top: 0 }); }} class="h-9 px-3.5 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors shrink-0">
								<Pencil class="w-3.5 h-3.5" /> Edit
							</button>
						</div>
						<div class="grid sm:grid-cols-3 gap-3 border-t border-surface-glass-border pt-4">
							{#each roster.slice(0, 2) as person (person.id ?? person.name)}
								<div class="rounded-lg bg-surface-container-low border border-surface-glass-border px-4 py-3 flex items-center gap-3 min-w-0"><Avatar name={person.name} src={person.avatarUrl} color={person.avatarColor} size="xs" /><span class="min-w-0"><span class="text-body-md font-semibold text-on-surface block truncate">{person.name}</span><span class="text-body-sm text-on-surface-variant block truncate">{person.role}</span></span></div>
							{/each}
							{#if roster.length > 2}<div class="rounded-lg bg-surface-container-low border border-surface-glass-border px-4 py-3 flex items-center gap-3 min-w-0"><span class="w-7 h-7 rounded-full bg-surface-container-high border border-surface-glass-border font-code text-label-badge text-on-surface-variant flex items-center justify-center shrink-0">+{roster.length - 2}</span><span class="text-body-sm text-on-surface-variant">More speakers/performers</span></div>{/if}
							{#if roster.length === 0}<p class="text-body-sm text-on-surface-variant col-span-full">No speakers or performers added yet.</p>{/if}
						</div>
					</div>

					<!-- module 4 -->
					<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
						<div class="flex items-center justify-between gap-3">
							<span class="flex items-center gap-3 min-w-0">
								<span class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border font-code text-label-badge text-on-surface flex items-center justify-center shrink-0">4</span>
								<span class="min-w-0">
									<span class="text-body-lg font-semibold text-on-surface block truncate">Gate Architecture &amp; Scanner Terminals</span>
									<span class="text-body-sm text-on-surface-variant block pt-0.5">Dynamic QR Passes • Offline Cache Active</span>
								</span>
							</span>
							<button type="button" onclick={() => { step = 4; scrollTo({ top: 0 }); }} class="h-9 px-3.5 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors shrink-0">
								<Pencil class="w-3.5 h-3.5" /> Edit
							</button>
						</div>
						<div class="grid grid-cols-2 xl:grid-cols-4 gap-4 border-t border-surface-glass-border pt-4">
							<div>
								<span class="{MONO} text-on-surface-variant block">Active Gates</span>
								<span class="text-body-md font-semibold text-on-surface block pt-1 truncate">{gates.map((g) => g.name).slice(0, 2).join(' & ') || 'Gate A'}</span>
							</div>
							<div>
								<span class="{MONO} text-on-surface-variant block">Hardware Devices</span>
								<span class="text-body-md font-semibold text-on-surface block pt-1">{staffTotal} Door Scanners</span>
							</div>
							<div>
								<span class="{MONO} text-on-surface-variant block">Staff Access PIN</span>
								<span class="font-code text-body-md font-bold text-on-surface block pt-1">#8402</span>
							</div>
							<div>
								<span class="{MONO} text-on-surface-variant block">Sync Latency</span>
								<span class="text-body-md font-semibold text-on-surface block pt-1">&lt; 120ms P2P</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			<!-- right column -->
			<aside class="flex flex-col gap-6 min-w-0">
				<!-- settlement -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3">
						<span class="flex items-center gap-2.5">
							<Landmark class="w-4.5 h-4.5 text-primary" />
							<span class="font-display text-headline-md text-on-surface">Settlement &amp; Payouts</span>
						</span>
						<button type="button" onclick={() => toast('Update your payout account in Settings → Verification', 'info')} class="{MONO} text-on-surface underline underline-offset-4 hover:text-primary">Change</button>
					</div>
					<div class="rounded-lg bg-surface-container-low border border-surface-glass-border p-4 flex items-center gap-3">
						<span class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border font-code text-label-badge font-bold text-on-surface flex items-center justify-center shrink-0">{savedPayoutReady ? payoutBankMark(savedPayout.bank) : '—'}</span>
						<span class="min-w-0 flex-1">
							<span class="text-body-md font-semibold text-on-surface block">{savedPayoutReady ? savedPayout.bank : 'No payout account linked'}</span>
							<span class="font-code text-[12px] tracking-[0.06em] text-on-surface-variant block pt-0.5">{savedPayoutReady ? `${maskAccountNumber(savedPayout.accountNumber)} (NGN Main)` : 'Add payout in Settings → Verification'}</span>
						</span>
						<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded shrink-0">{savedPayoutReady ? 'Verified' : 'Not verified'}</span>
					</div>
					<div class="flex flex-col gap-2">
						{#each [
							['Gateway Engine:', 'Paystack Split Gateway (KYC Tier 3)'],
							['Payout Frequency:', 'T+2 Rolling Settlement']
						] as [k, v]}
							<div class="flex items-baseline justify-between gap-3">
								<span class="{MONO} text-on-surface-variant">{k}</span>
								<span class="font-code text-[12px] tracking-[0.06em] text-on-surface text-right">{v}</span>
							</div>
						{/each}
					</div>
					<div class="rounded-lg bg-surface-base border border-surface-glass-border p-4 flex gap-3">
						<Info class="w-4 h-4 text-on-surface-variant shrink-0 mt-0.5" />
						<p class="text-body-sm text-on-surface-variant leading-relaxed">
							<span class="text-on-surface font-semibold">Fee Policy:</span> ₦0 upfront creation fee. A flat 3.0%
							protocol charge is deducted automatically at ticket checkout.
						</p>
					</div>
				</div>

				<!-- distribution -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-5">
					<span class="flex items-center gap-2.5">
						<Share2 class="w-4.5 h-4.5 text-primary" />
						<span class="font-display text-headline-md text-on-surface">Distribution &amp; Discovery Controls</span>
					</span>
					{#each [
						{ key: 'explore', title: 'Publish to OWLTSIDE Explore', sub: 'Feature on global discovery and location heatmaps.' },
						{ key: 'broadcast', title: 'Instant Organizer Broadcast', sub: 'Dispatch push notification to followers immediately upon launch.' }
					] as row (row.key)}
						<div class="flex items-start justify-between gap-4">
							<span class="min-w-0">
								<span class="text-body-md font-semibold text-on-surface block">{row.title}</span>
								<span class="text-body-sm text-on-surface-variant block pt-0.5">{row.sub}</span>
							</span>
							<button
								type="button"
								role="switch"
								aria-label={row.title}
								aria-checked={row.key === 'explore' ? publishExplore : broadcast}
								onclick={() => {
									if (row.key === 'explore') publishExplore = !publishExplore;
									else broadcast = !broadcast;
								}}
								class="w-11 h-6 rounded-full relative shrink-0 transition-colors
									{row.key === 'explore' ? (publishExplore ? 'bg-primary' : 'bg-surface-container-highest') : broadcast ? 'bg-primary' : 'bg-surface-container-highest'}"
							>
								<span
									class="absolute top-0.5 w-5 h-5 rounded-full bg-surface-base transition-all
										{row.key === 'explore' ? (publishExplore ? 'left-[22px]' : 'left-0.5') : broadcast ? 'left-[22px]' : 'left-0.5'}"
								></span>
							</button>
						</div>
					{/each}
					<div class="flex flex-col gap-2 border-t border-surface-glass-border pt-4">
						<span class="{MONO} text-on-surface-variant">Launch Timeline</span>
						{#each [
							{ id: 'now', icon: true, title: 'Publish Now', badge: 'Instant', sub: 'Smart contracts deploy immediately; live on explore under 30 seconds.' },
							{ id: 'staged', icon: false, title: 'Schedule Staged Drop', badge: '', sub: 'Specify exact embargo date, countdown page, and queue opening.' }
						] as row (row.id)}
							<label class="rounded-lg border border-surface-glass-border bg-surface-container-low px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors {launchMode === row.id ? 'border-primary/50' : ''}">
								<input type="radio" name="launchMode" class="accent-[#c0c1ff] w-4 h-4 mt-0.5" checked={launchMode === row.id} onchange={() => (launchMode = row.id as 'now' | 'staged')} />
								<span class="min-w-0">
									<span class="flex items-center gap-2 flex-wrap">
										{#if row.icon}<Zap class="w-3.5 h-3.5 text-accent-amber" />{/if}
										<span class="text-body-md font-semibold text-on-surface">{row.title}</span>
										{#if row.badge}<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-1.5 py-0.5 rounded">{row.badge}</span>{/if}
									</span>
									<span class="text-body-sm text-on-surface-variant block pt-0.5">{row.sub}</span>
								</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- final approval -->
				<form method="POST" action="?/create" use:enhance={publishHandler} class="rounded-xl border border-surface-glass-border bg-surface-container-low p-5 flex flex-col gap-4">
					<input type="hidden" name="draft" value={draftJson} />
				<input type="hidden" name="eventId" value={editingEvent?.id ?? ''} />
					{#if form?.error}
						<p role="alert" class="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-body-sm text-error">{form.error}</p>
					{/if}
					<div class="flex items-center justify-between gap-3">
						<span class="{MONO} text-on-surface-variant">Final Approval</span>
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<ShieldCheck class="w-3.5 h-3.5 text-primary" /> Decentralized Event Engine
						</span>
					</div>
					<p class="text-body-sm text-on-surface-variant leading-relaxed">
						By executing this launch, ticket pools will be written to the ledger, and your organizer
						account will become liable for venue capacity limits under OWLTSIDE Protocol terms.
					</p>
					<div class="flex items-center gap-3 pt-1">
						<button type="button" onclick={saveDraft} class="h-12 px-5 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface hover:border-primary/40 transition-colors shrink-0">
							Save Draft
						</button>
						<button type="submit" disabled={!canContinue} class="flex-1 h-12 rounded-lg bg-primary text-on-primary text-body-md font-semibold flex items-center justify-center gap-2 hover:bg-primary-container transition-colors glow-primary disabled:opacity-40">
							<span>{editingEvent ? 'Save Event Changes' : 'Launch &amp; Publish Event'}</span>
							<Rocket class="w-4 h-4" />
						</button>
					</div>
					<span class="flex items-center justify-center gap-1.5 font-code text-[11px] tracking-[0.08em] text-on-surface-variant">
						<Clock class="w-3.5 h-3.5" /> Draft stays on this page until published
					</span>
				</form>
			</aside>
		</div>

		<!-- footer -->
		<footer class="mt-8 border-t border-surface-glass-border">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
				<span class="flex items-center gap-3">
					<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
					<span class="{MONO} text-on-surface-variant">Decentralized Event Protocol</span>
				</span>
				<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					Mainnet 99.98% Operational • Latency: 24ms
				</span>
				<span class="text-body-sm text-on-surface-variant">© {new Date().getFullYear()} OWLTSIDE Protocol. All rights reserved.</span>
			</div>
		</footer>
	</div>
{/if}

<div class="md:hidden">

<main class="flex flex-col relative w-full pt-2 pb-28 bg-surface min-h-dvh">
	<!-- top bar -->
	<div class="w-full bg-surface/85 backdrop-blur-xl border-b border-surface-glass-border mb-4">
		<div class="flex items-center px-gutter h-14 md:max-w-3xl md:mx-auto w-full gap-2">
			<button onclick={back} aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
				<ArrowLeft class="w-5.5 h-5.5" />
			</button>
			<div class="flex flex-col flex-1 min-w-0">
				<h1 class="font-display text-headline-md text-on-surface truncate leading-tight">New Event Wizard</h1>
			</div>
			<button type="button" onclick={saveDraft} aria-label="Save draft" class="flex items-center gap-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 px-2.5 py-2 text-label-badge text-on-surface-variant">
				<Save class="w-3.5 h-3.5 text-accent-emerald" /><span>Save draft</span>
			</button>
		</div>
	</div>

	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md">
		<!-- progress -->
		<div class="flex flex-col gap-space-sm">
			<div class="flex items-center justify-between">
				<span class="rounded-full bg-surface-container-high border border-outline-variant/30 px-2.5 py-1 text-label-badge text-on-surface-variant uppercase tracking-wider">Creation Flow</span>
				<div class="flex items-center gap-2">
					<span class="text-body-sm text-on-surface-variant">Step {step} of 5</span>
					<span class="text-label-badge text-accent-emerald font-semibold">{step * 20}% Completed</span>
				</div>
			</div>
			<div class="flex gap-1.5">
				{#each Array(5) as _, i (i)}
					<div class="h-1.5 flex-1 rounded-full transition-colors duration-500 {i < step ? 'bg-on-surface' : 'bg-surface-container-high'}"></div>
				{/each}
			</div>
			<nav aria-label="Event creation steps" class="flex gap-2 overflow-x-auto -mx-gutter px-gutter pb-1 scrollbar-none">
				{#each [{ n: 1, label: 'Basics' }, { n: 2, label: 'Tickets' }, { n: 3, label: 'Schedule' }, { n: 4, label: 'Gates' }, { n: 5, label: 'Review' }] as item (item.n)}
					<button type="button" aria-current={step === item.n ? 'step' : undefined} onclick={() => { step = item.n; scrollTo({ top: 0 }); }} class="flex items-center gap-2 h-9 px-3 rounded-full border text-label-badge whitespace-nowrap {step === item.n ? 'border-primary/40 bg-primary/10 text-primary' : step > item.n ? 'border-accent-emerald/30 bg-accent-emerald/10 text-accent-emerald' : 'border-surface-glass-border bg-surface-container text-on-surface-variant'}">
						<span class="w-5 h-5 rounded-full flex items-center justify-center font-code text-[10px] {step > item.n ? 'bg-accent-emerald/20' : step === item.n ? 'bg-primary text-on-primary' : 'bg-surface-container-high'}">{step > item.n ? '✓' : item.n}</span>{item.label}
					</button>
				{/each}
			</nav>
			<div class="flex flex-col">
				<span class="font-display text-headline-lg-mobile text-on-surface">{stepMeta[step].title}</span>
				<span class="text-body-sm text-on-surface-variant">{stepMeta[step].sub}</span>
			</div>
		</div>

		<!-- STEP 1 -->
		{#if step === 1}
			<div class="flex flex-col gap-space-md">
				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center justify-between">
						<span class="text-body-sm text-on-surface-variant">Event Title</span>
						<span class="text-label-badge text-on-surface-variant">{title.length}/80</span>
					</div>
					<input
						type="text"
						maxlength="80"
						bind:value={title}
						placeholder="e.g. Pulse AI Summit 2026"
						class="w-full px-4 py-3.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-lg focus:outline-none focus:border-outline"
					/>
					<div class="flex flex-col gap-2 pt-1">
						<label for="event-category-mobile" class="text-body-sm text-on-surface-variant">Category</label>
						<select id="event-category-mobile" bind:value={selectedCategory} class="w-full px-3 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline">
							<option value="" disabled>Select category</option>
							{#each categoryOptions as category (category.id)}<option value={category.id}>{category.label}</option>{/each}
							<option value="custom">Custom category…</option>
						</select>
						{#if selectedCategory === 'custom'}<input type="text" bind:value={customCategory} maxlength="48" placeholder="Enter a custom category" class="w-full px-3 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-space-sm">
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						<span class="text-body-sm text-on-surface-variant">Start date · WAT</span>
						<input type="date" bind:value={date} class="w-full px-3 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-sm [color-scheme:dark]" />
					</div>
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						<span class="text-body-sm text-on-surface-variant">End date · WAT</span>
						<input type="date" bind:value={dateEnd} class="w-full px-3 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-sm [color-scheme:dark]" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-space-sm">
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						<label for="event-city" class="text-body-sm text-on-surface-variant">City</label>
						<select id="event-city" bind:value={city} required class="w-full px-3 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline">
							<option value="" disabled>Select state</option>
							{#each NIGERIAN_STATES as state (state)}
								<option value={state}>{state} State</option>
							{/each}
						</select>
					</div>
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						<span class="text-body-sm text-on-surface-variant">Venue</span>
						<input type="text" bind:value={venue} placeholder="The Civic Centre" class="w-full px-3 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
					</div>
				</div>
				<div class="rounded-xl bg-surface-container border border-surface-glass-border overflow-hidden">
					<div class="relative h-32 bg-surface-container-low">
						<div class="absolute inset-0 opacity-50" style="background-image: linear-gradient(rgba(192,193,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(192,193,255,0.07) 1px, transparent 1px); background-size: 28px 28px;"></div>
						<span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center"><MapPin class="w-4 h-4" /></span>
						<span class="absolute top-2 left-2 px-2 py-1 rounded bg-surface-base/85 text-label-badge text-on-surface">GPS: 6.4253° N, 3.4219° E</span>
						<span class="absolute top-2 right-2 px-2 py-1 rounded bg-surface-base/85 text-label-badge text-accent-emerald">Live radar locked</span>
					</div>
					<div class="p-3 flex items-center justify-between gap-2"><span class="min-w-0"><span class="block text-label-badge text-on-surface-variant">Physical venue &amp; coordinates</span><span class="block text-body-sm text-on-surface truncate pt-1">{venue || 'Venue TBA'} · {city}</span></span><button type="button" class="text-label-badge text-primary font-semibold shrink-0" onclick={() => toast('Coordinate calibration locked to venue node', 'info')}>Calibrate</button></div>
				</div>
				<div class="rounded-xl bg-surface-container border border-surface-glass-border overflow-hidden">
					{#if coverUrl}
					<img src={coverUrl} alt="Event cover" class="w-full h-36 object-cover" />
					{:else}
					<Cover cover={demoCover} class="w-full h-36" iconClass="w-10 h-10 text-white/30" />
					{/if}
					<div class="p-3 flex items-center justify-between gap-3"><span class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Keyframe artwork · 16:9 banner</span><span class="block text-label-badge text-on-surface-variant pt-1">Recommended 1280 × 720 · up to 12 MB</span>{#if coverUrl}<span class="block text-label-badge text-accent-emerald truncate pt-1">{coverName}</span>{/if}</span>{#if coverUrl}<span class="flex items-center gap-2 shrink-0"><label class="h-9 px-3 rounded-full bg-surface-container-high border border-surface-glass-border text-label-badge text-on-surface flex items-center gap-1 cursor-pointer"><CloudUpload class="w-3.5 h-3.5" />Replace<input type="file" aria-label="Upload event poster" accept="image/jpeg,image/png,image/webp" class="sr-only" onchange={handleCoverSelect} /></label><button type="button" onclick={clearCover} class="h-9 px-3 rounded-full border border-surface-glass-border text-label-badge text-on-surface-variant">Remove</button></span>{:else}<span class="flex items-center gap-2 shrink-0"><label class="h-9 px-3 rounded-full bg-surface-container-high border border-surface-glass-border text-label-badge text-on-surface flex items-center gap-1 cursor-pointer"><CloudUpload class="w-3.5 h-3.5" />Upload<input type="file" aria-label="Upload event poster" accept="image/jpeg,image/png,image/webp" class="sr-only" onchange={handleCoverSelect} /></label></span>{/if}</div>
					{#if coverError}<p class="px-3 pb-3 text-body-sm text-error" role="alert">{coverError}</p>{/if}
				</div>

				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2"><span class="text-body-sm text-on-surface-variant">Program description</span><span class="text-label-badge text-on-surface-variant">{description.length}/600</span></div>
					<div class="flex items-center gap-1 overflow-x-auto bg-surface-container-high border border-surface-glass-border rounded-lg p-1 scrollbar-none">
						{#each [Bold, Italic, Link2, Code, List, ListOrdered, Quote] as Icon, i (i)}
							<button type="button" aria-label="Description format {i + 1}" onclick={() => toast('Markdown formatting is applied when the event is published', 'info')} class="w-9 h-9 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface shrink-0"><Icon class="w-4 h-4" /></button>
						{/each}
						<button type="button" aria-expanded={showDescriptionPreview} onclick={() => (showDescriptionPreview = !showDescriptionPreview)} class="ml-auto px-2 h-9 rounded-md text-label-badge text-primary shrink-0">{showDescriptionPreview ? 'Hide preview' : 'Preview'}</button>
					</div>
					<textarea bind:value={description} rows="4" maxlength="600" placeholder="What will attendees experience?" class="w-full px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
					{#if showDescriptionPreview}<div class="rounded-lg bg-surface-container-low border border-surface-glass-border p-3"><span class="block text-label-badge text-on-surface-variant uppercase tracking-wider">Live event preview</span><p class="text-body-sm text-on-surface whitespace-pre-wrap pt-2">{description || 'Your event description will preview here.'}</p></div>{/if}
				</div>
			</div>

			<!-- STEP 2 -->
		{:else if step === 2}
			<div class="flex flex-col gap-space-sm">
				<div class="flex items-center justify-between">
					<span class="rounded-full bg-surface-container-high border border-outline-variant/30 px-2.5 py-1 text-label-badge text-on-surface-variant">NGN (₦) • Paystack</span>
					<span class="text-body-sm text-on-surface-variant">{totalCapacity.toLocaleString()} total capacity</span>
				</div>
				{#each tiers as tier, i (i)}
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						{#if tier.editing}
							<div class="grid grid-cols-2 gap-2">
								<label class="col-span-2 flex flex-col gap-1 text-label-badge text-on-surface-variant">
									Tier name
									<input type="text" bind:value={tier.name} class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
								</label>
								<label class="flex flex-col gap-1 text-label-badge text-on-surface-variant">
									Price (₦)
									<input type="number" min="0" bind:value={tier.price} class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
								</label>
								<label class="flex flex-col gap-1 text-label-badge text-on-surface-variant">
									Capacity
									<input type="number" min="1" bind:value={tier.capacity} class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
								</label>
								<label class="col-span-2 flex flex-col gap-1 text-label-badge text-on-surface-variant">
									Benefits (optional)
									<input type="text" bind:value={tier.benefits} class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
								</label>
							</div>
							<button class="self-end px-4 py-1.5 rounded-full bg-primary text-on-primary text-body-sm font-medium" onclick={() => (tier.editing = false)}>Done</button>
						{:else}
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2 min-w-0">
									<span class="text-body-lg text-on-surface font-semibold truncate">{tier.name}</span>
									<span class="rounded-full bg-accent-emerald/10 border border-accent-emerald/30 px-2 py-0.5 text-label-badge text-accent-emerald">Active</span>
								</div>
								<div class="flex items-center gap-1 flex-shrink-0">
									<button aria-label="Edit tier" class="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface" onclick={() => (tier.editing = true)}>
										<Pencil class="w-3.5 h-3.5" />
									</button>
									<button aria-label="Delete tier" class="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-error" onclick={() => (tiers = tiers.filter((_, j) => j !== i))}>
										<Trash2 class="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
							<div class="flex items-baseline gap-2">
								<span class="font-display text-headline-lg-mobile text-on-surface">{tier.price === 0 ? 'Free' : formatMoney(tier.price)}</span>
								<span class="text-body-sm text-on-surface-variant">• {tier.capacity.toLocaleString()} capacity{tier.benefits ? ` • ${tier.benefits}` : ''}</span>
							</div>
						{/if}
					</div>
				{/each}
				<button class="h-12 rounded-full border border-dashed border-outline-variant/60 text-on-surface-variant text-body-md font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors" onclick={addTier}>
					<Plus class="w-4 h-4" /> Add ticket tier
				</button>
				<!-- Promo Codes — mobile -->
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-3">
					<div class="flex items-center justify-between gap-2">
						<span class="flex items-center gap-2">
							<Tag class="w-4 h-4 text-primary" />
							<span class="font-display text-body-lg font-semibold text-on-surface">Promo Codes</span>
						</span>
						<span class="text-label-badge px-2 py-0.5 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant">{activePromoCount} Active</span>
					</div>
					<p class="text-body-sm text-on-surface-variant">Eg: <span class="font-semibold text-on-surface">Owltside — 5% off — first 50 people</span>.</p>
					<div class="flex flex-col gap-2.5">
						<label class="flex flex-col gap-1 text-label-badge text-on-surface-variant">Promo code<input type="text" placeholder="Owltside" bind:value={promoCode} maxlength="24" class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" /></label>
						<div class="grid grid-cols-2 gap-2.5">
							<label class="flex flex-col gap-1 text-label-badge text-on-surface-variant">% off<span class="relative flex items-center"><input type="number" inputmode="numeric" min="1" max="100" placeholder="5" bind:value={promoPercent} class="w-full h-11 pl-3 pr-6 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" /><Percent class="w-3.5 h-3.5 text-on-surface-variant absolute right-2.5 pointer-events-none" /></span></label>
							<label class="flex flex-col gap-1 text-label-badge text-on-surface-variant">No. of purchases<input type="number" inputmode="numeric" min="1" placeholder="50" bind:value={promoMax} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" /></label>
						</div>
						<button type="button" onclick={addPromo} class="h-11 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90">
							<Plus class="w-4 h-4" /> Add
						</button>
						{#if promoError}
							<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2" role="alert">{promoError}</p>
						{/if}
						{#if promos.length}
							<div class="flex flex-col gap-2 pt-1">
								{#each promos as promo, idx (promo.code)}
									<div class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
										<span class="min-w-0">
											<span class="block text-body-sm font-semibold text-on-surface">{promo.code} — {promo.percent}% off — first {promo.maxUses}</span>
											<span class="block text-xs text-on-surface-variant">{promo.uses ?? 0} of {promo.maxUses} redeemed • {promo.percent}%</span>
										</span>
										<button type="button" aria-label="Remove {promo.code}" onclick={() => removePromo(idx)} class="w-8 h-8 rounded-full bg-surface-container border border-surface-glass-border flex items-center justify-center text-on-surface-variant hover:text-error shrink-0"><Trash2 class="w-3.5 h-3.5" /></button>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-body-sm text-on-surface-variant rounded-lg bg-surface-container-high/30 border border-dashed border-surface-glass-border px-3 py-2.5">No promos yet.</p>
						{/if}
					</div>
				</div>
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
					<h3 class="font-display text-headline-md text-on-surface">Issuance &amp; Settlement</h3>
					<div class="grid grid-cols-3 gap-2"><div class="rounded-lg bg-surface-container-high p-2.5"><span class="block text-label-badge text-on-surface-variant">Starting at</span><span class="block text-body-sm font-bold text-on-surface pt-1">{minTierPrice === 0 ? 'Free' : formatMoney(minTierPrice)}</span></div><div class="rounded-lg bg-surface-container-high p-2.5"><span class="block text-label-badge text-on-surface-variant">Capacity</span><span class="block text-body-sm font-bold text-on-surface pt-1">{totalCapacity.toLocaleString()}</span></div><div class="rounded-lg bg-surface-container-high p-2.5"><span class="block text-label-badge text-on-surface-variant">Gross cap</span><span class="block text-body-sm font-bold text-on-surface pt-1">{formatMoney(totalGross)}</span></div></div>
					<div class="flex items-start gap-2 rounded-lg bg-surface-container-low border border-surface-glass-border p-3"><Landmark class="w-4 h-4 text-primary shrink-0 mt-0.5" /><p class="text-body-sm text-on-surface-variant">{#if savedPayoutReady}<span class="text-on-surface font-semibold">{savedPayout.bank} · {maskAccountNumber(savedPayout.accountNumber)}</span><br />Paystack split gateway · KYC Tier 3{:else}<span class="text-on-surface font-semibold">No payout account linked</span><br />Add your payout account in Settings → Verification{/if}<br />T+2 rolling settlement · 3% protocol fee · no upfront listing charge.</p></div>
				</section>
			</div>

			<!-- STEP 3 -->
		{:else if step === 3}
			<div class="flex flex-col gap-space-sm">
				<div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
					{#each days as d, i (d.label)}
						<button
							class="px-4 py-2 rounded-full text-body-sm font-medium whitespace-nowrap border transition-all {i === dayIdx ? 'bg-on-surface text-surface border-on-surface' : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant'}"
							onclick={() => (dayIdx = i)}
						>Day {i + 1} • {d.label}</button>
					{/each}
					<button class="px-3 py-2 rounded-full text-body-sm border border-dashed border-outline-variant/60 text-on-surface-variant whitespace-nowrap" onclick={addDay}>
						+ Day
					</button>
				</div>
				<p class="text-label-badge text-on-surface-variant">Type a room or stage name for each session.</p>
				<div class="flex flex-col gap-2">
					{#if days.length && days[dayIdx]}
					{#each days[dayIdx].sessions as s, i (i)}
						<div class="flex items-start gap-space-sm rounded-xl bg-surface-container border border-outline-variant/30 p-space-md">
							<span class="font-code text-body-md text-primary pt-0.5 w-14 flex-shrink-0">{s.time}</span>
							<div class="flex flex-col flex-1 min-w-0">
								<span class="text-body-md text-on-surface font-medium">{s.title}</span>
								<input type="text" bind:value={s.stage} aria-label="Room or stage for {s.title}" class="w-full mt-1 px-2 py-1 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant text-body-sm focus:outline-none focus:border-primary/50" />
							</div>
							<button aria-label="Remove session" class="text-on-surface-variant hover:text-error" onclick={() => (days[dayIdx].sessions = days[dayIdx].sessions.filter((_, j) => j !== i))}>
								<Trash2 class="w-4 h-4" />
							</button>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant py-4">No sessions on this day yet.</p>
					{/each}
					{:else}
						<p class="text-body-sm text-on-surface-variant py-4">No days yet — add a day to begin scheduling.</p>
					{/if}
				</div>
				<div class="rounded-xl bg-surface-container-low border border-dashed border-outline-variant/50 p-space-md grid grid-cols-[80px_1fr] gap-2">
					<input type="time" bind:value={newSession.time} class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
					<input type="text" bind:value={newSession.title} placeholder="Session title" class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
					<input type="text" bind:value={newSession.stage} placeholder="Room or stage name" aria-label="Room or stage name" class="col-span-2 px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
					<button class="col-span-2 h-10 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center gap-1.5" onclick={addSession}>
						<Plus class="w-4 h-4" /> Add session
					</button>
				</div>
				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center justify-between gap-2"><span><span class="block font-display text-headline-md text-on-surface">Speaker/Performer</span><span class="block text-label-badge text-on-surface-variant pt-1">Role and invitation status appear in the event lineup</span></span><button type="button" aria-label="Invite speaker or performer" onclick={openInviteDialog} class="h-9 px-3 rounded-full bg-surface-container-high border border-surface-glass-border text-label-badge text-on-surface flex items-center gap-1"><UserPlus class="w-3.5 h-3.5" />Invite</button></div>
					{#each roster as person (person.id ?? person.name)}
						<div class="rounded-xl bg-surface-container-low border border-surface-glass-border p-3 flex items-start gap-3"><Avatar name={person.name} color={person.avatarColor} src={person.avatarUrl} size="sm" /><span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface truncate">{person.name}</span><span class="block text-label-badge text-on-surface-variant truncate">{person.role}</span><span class="block text-label-badge text-on-surface-variant pt-1">{person.invited ? `Invite pending · @${person.handle}` : 'Display only'}</span>{#if person.bio}<span class="block text-label-badge text-on-surface-variant pt-1">{person.bio}</span>{/if}</span><button type="button" aria-label="Remove {person.name}" onclick={() => removeSpeaker(person)} class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error shrink-0"><X class="w-4 h-4" /></button></div>
					{:else}
						<p class="rounded-xl border border-dashed border-outline-variant/50 p-6 text-body-sm text-on-surface-variant">No speakers or performers added yet.</p>
					{/each}
				</section>
			</div>

			<!-- STEP 4 -->
		{:else if step === 4}
			<div class="flex flex-col gap-space-sm">
				<div class="rounded-xl bg-surface-container-low border border-accent-emerald/25 p-space-md flex items-start gap-3">
					<span class="w-9 h-9 rounded-full bg-accent-emerald/15 text-accent-emerald flex items-center justify-center flex-shrink-0"><ShieldCheck class="w-5 h-5" /></span>
					<p class="text-body-sm text-on-surface-variant">
						Staff scan via zero-install Progressive Web App. Pre-cached public keys enable
						<span class="text-on-surface font-medium">sub-millisecond offline verification</span> — gates keep
						working even when the venue network drops.
					</p>
				</div>
				{#each gates as gate, i (i)}
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-3">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0 flex-1">
								<span class="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface flex items-center justify-center flex-shrink-0"><ScanBarcode class="w-4.5 h-4.5" /></span>
								{#if gateEdit === i}
									<input aria-label="Gate name" bind:value={gate.name} class="min-w-0 flex-1 px-2 py-2 rounded-lg bg-surface-base border border-surface-glass-border text-body-sm text-on-surface" />
								{:else}<span class="text-body-lg text-on-surface font-semibold truncate">Gate {i + 1}: {gate.name}</span>{/if}
							</div>
							<span class="text-label-badge text-on-surface-variant shrink-0">QR · Manual</span>
						</div>
						<p class="text-body-sm text-on-surface-variant">{gateSubs[i % gateSubs.length]}</p>
						<div class="flex items-center justify-between">
							<div class="flex -space-x-2">
								{#each Array(Math.min(gate.staff, 4)) as _, s (s)}
									<span class="w-7 h-7 rounded-full bg-surface-container-highest border-2 border-surface-container text-label-badge text-on-surface-variant flex items-center justify-center">{s + 1}</span>
								{/each}
							</div>
							<span class="flex items-center gap-2 {MONO} text-on-surface-variant bg-surface-container-low border border-surface-glass-border px-2.5 py-1 rounded">{gate.staff} Scanners</span>
						</div>
						<div class="flex items-center justify-between border-t border-surface-glass-border pt-2"><span class="text-label-badge text-on-surface-variant">Est. capacity: {(gate.staff * 450).toLocaleString()}/hr</span><span class="flex items-center gap-1"><button type="button" class="text-label-badge text-primary underline" onclick={() => (gateEdit = gateEdit === i ? -1 : i)}>{gateEdit === i ? 'Done' : 'edit'}</button>{#if gates.length > 1}<button type="button" aria-label="Remove gate" class="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error" onclick={() => (gates = gates.filter((_, j) => j !== i))}><Trash2 class="w-4 h-4" /></button>{/if}</span></div>
					</div>
				{/each}
				<button class="h-12 rounded-full border border-dashed border-outline-variant/60 text-on-surface-variant text-body-md font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors" onclick={() => (gates = [...gates, { name: 'New Gate', staff: 2 }])}>
					<Plus class="w-4 h-4" /> Add gate
				</button>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center justify-between gap-2"><span><span class="block font-display text-headline-md text-on-surface">Field Scanner Authentication</span><span class="block text-label-badge text-on-surface-variant pt-1">Temporary token · revocable</span></span><ScanLine class="w-5 h-5 text-primary" /></div>
					<div class="rounded-xl bg-surface-container-low border border-surface-glass-border p-3 flex items-center justify-between gap-2"><span><span class="block text-label-badge text-on-surface-variant">Turnstile master PIN</span><span class="block font-code text-headline-md tracking-[0.16em] text-on-surface pt-1">8042-99</span><span class="block text-label-badge text-on-surface-variant pt-1">Expires in 18h 42m · revocable</span></span><button type="button" onclick={copyPwaLink} class="h-10 px-3 rounded-lg bg-surface-container-high border border-surface-glass-border text-label-badge text-on-surface flex items-center gap-1 shrink-0"><Copy class="w-3.5 h-3.5" />PWA link</button></div>
					<span class="text-label-badge uppercase tracking-wider text-on-surface-variant">Gatekeeper authority matrix</span>
					{#each [{ title: 'Allow manual ticket override', sub: 'Supervisor PIN required for disputed ticket hashes', value: allowOverride, bind: 'override' }, { title: 'Allow offline scan cache sync', sub: 'Stores verification proofs locally if Wi-Fi drops', value: allowOffline, bind: 'offline' }, { title: 'Restrict scans to assigned gates', sub: 'Blocks VIP passes at general admission entrances', value: restrictGates, bind: 'restrict' }] as policy (policy.bind)}
						<label class="rounded-xl border border-surface-glass-border bg-surface-container-low p-3 flex items-start gap-3"><input type="checkbox" checked={policy.value} onchange={() => { if (policy.bind === 'override') allowOverride = !allowOverride; else if (policy.bind === 'offline') allowOffline = !allowOffline; else restrictGates = !restrictGates; }} class="mt-0.5 w-4 h-4 accent-[#c0c1ff]" /><span><span class="block text-body-sm font-semibold text-on-surface">{policy.title}</span><span class="block text-label-badge text-on-surface-variant pt-1">{policy.sub}</span></span></label>
					{/each}
				</section>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center justify-between gap-2"><span class="font-display text-headline-md text-on-surface">Anti-Fraud Safeguards</span><span class="text-label-badge text-on-surface-variant">Zero-knowledge</span></div>
					{#each [{ title: 'Dynamic 30s HMAC QR rotation', sub: 'Stops screenshot reuse and replay attempts', bind: 'hmac', value: hmacRotation }, { title: 'Offline verification keyring', sub: 'Pre-seed turnstiles for zero-latency validation', bind: 'keyring', value: offlineKeyring }, { title: 'Biometric turnstile fast-pass', sub: 'Optional on-device identity verification', bind: 'bio', value: biometricFast }] as safeguard (safeguard.bind)}
						<label class="flex items-start justify-between gap-3 rounded-xl border border-surface-glass-border bg-surface-container-low p-3"><span><span class="block text-body-sm font-semibold text-on-surface">{safeguard.title}</span><span class="block text-label-badge text-on-surface-variant pt-1">{safeguard.sub}</span></span><input type="checkbox" checked={safeguard.value} onchange={() => { if (safeguard.bind === 'hmac') hmacRotation = !hmacRotation; else if (safeguard.bind === 'keyring') offlineKeyring = !offlineKeyring; else biometricFast = !biometricFast; }} class="w-4 h-4 accent-[#c0c1ff] shrink-0" /></label>
					{/each}
					<label class="flex flex-col gap-1 text-label-badge text-on-surface-variant">Duplicate-entry policy<select bind:value={conflictPolicy} class="h-11 px-3 rounded-lg bg-surface-container-low border border-surface-glass-border text-body-sm text-on-surface"><option value="strict">Strict rejection &amp; log</option><option value="quarantine">Quarantine for re-verification</option><option value="warn">Warn and notify security</option></select></label>
					<p class="text-label-badge text-on-surface-variant">Triggered if a checked-in ticket tries to enter again within 120 minutes.</p>
				</section>
			</div>

			<!-- STEP 5 -->
		{:else}
			<form
				method="POST"
				action="?/create"
				use:enhance={publishHandler}
				class="flex flex-col gap-space-sm"
			>
				<input type="hidden" name="draft" value={draftJson} />
				<input type="hidden" name="eventId" value={editingEvent?.id ?? ''} />
				{#if form?.error}
					<p role="alert" class="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-body-sm text-error">{form.error}</p>
				{/if}
				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center justify-between">
						<span class="flex items-center gap-1.5 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 px-2.5 py-1 text-label-badge text-accent-emerald">
							<span class="relative flex h-2 w-2">
								<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
								<span class="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald"></span>
							</span>
							Ready to Launch
						</span>
						<span class="font-code text-label-badge text-on-surface-variant">ID: EVT-NEW</span>
					</div>
					<div class="flex items-center gap-space-md">
						{#if coverUrl}
							<img src={coverUrl} alt="Event cover" class="w-16 h-16 rounded-xl object-cover shrink-0" />
						{:else}
							<Cover cover={demoCover} class="w-16 h-16 rounded-xl overflow-hidden shrink-0" iconClass="w-7 h-7 text-white/30" />
						{/if}
						<div class="flex flex-col min-w-0">
							<span class="font-display text-headline-md text-on-surface truncate">{title}</span>
							<span class="text-body-sm text-on-surface-variant truncate">{date} – {dateEnd} • {venue}, {city}</span>
						</div>
					</div>
				</div>
				<div class="grid grid-cols-3 rounded-xl border border-surface-glass-border bg-surface-container-high/60 divide-x divide-surface-glass-border">
					<div class="p-3 text-center"><span class="block text-label-badge uppercase text-on-surface-variant">Total max cap</span><span class="block font-display text-headline-md font-bold text-on-surface pt-1">{totalCapacity.toLocaleString()}</span><span class="block text-label-badge text-on-surface-variant">Guests · {days.length} days</span></div>
					<div class="p-3 text-center"><span class="block text-label-badge uppercase text-on-surface-variant">Gross cap</span><span class="block font-display text-body-lg font-bold text-primary pt-1">{formatMoney(totalGross)}</span><span class="block text-label-badge text-on-surface-variant">Estimated yield</span></div>
					<div class="p-3 text-center"><span class="block text-label-badge uppercase text-on-surface-variant">Gate security</span><span class="block font-display text-body-lg font-bold text-on-surface pt-1">{hmacRotation ? 'HMAC 30s' : 'Flexible'}</span><span class="block text-label-badge text-on-surface-variant">{hmacRotation ? 'Anti-screenshot' : 'Rotation off'}</span></div>
				</div>
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex items-start gap-3">
					<span class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center shrink-0"><ShieldCheck class="w-5 h-5" /></span>
					<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center justify-between gap-2"><span class="text-body-sm font-semibold text-on-surface">Pre-flight security audit: PASSED</span><span class="text-label-badge text-accent-emerald">0 errors · 0 bottlenecks</span></div><p class="text-label-badge text-on-surface-variant leading-relaxed pt-1">Agenda, gate policies, venue capacity, and cryptographic safeguards are ready for launch.</p></div>
				</div>
				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
					{#each [
						{ ok: title.trim().length >= 3, label: 'Event title & tags configured' },
						{ ok: tiers.length > 0, label: `${tiers.length} ticket tiers • ${totalCapacity.toLocaleString()} capacity` },
						{ ok: days.some((d) => d.sessions.length > 0), label: `${days.reduce((s, d) => s + d.sessions.length, 0)} agenda sessions` },
						{ ok: gates.length > 0, label: `${gates.length} gates • ${gates.reduce((s, g) => s + g.staff, 0)} staff members` }
					] as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-5 h-5 rounded-full flex items-center justify-center {item.ok ? 'bg-accent-emerald/15 text-accent-emerald' : 'bg-accent-amber/15 text-accent-amber'}">
								{#if item.ok}<Check class="w-3 h-3" />{:else}<Megaphone class="w-3 h-3" />{/if}
							</span>
							<span class="text-body-sm {item.ok ? 'text-on-surface' : 'text-on-surface-variant'}">{item.label}</span>
						</div>
					{/each}
				</div>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center justify-between gap-2"><span class="font-display text-headline-md text-on-surface">Settlement &amp; Payouts</span><button type="button" onclick={() => toast('Update your payout account in Settings → Verification', 'info')} class="text-label-badge text-primary underline">Change</button></div>
					<div class="rounded-xl bg-surface-container-low border border-surface-glass-border p-3 flex items-center gap-3"><span class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center font-code text-label-badge font-bold text-on-surface">{savedPayoutReady ? payoutBankMark(savedPayout.bank) : '—'}</span><span class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface">{savedPayoutReady ? savedPayout.bank : 'No payout account linked'}</span><span class="block text-label-badge text-on-surface-variant pt-1">{savedPayoutReady ? `${maskAccountNumber(savedPayout.accountNumber)} · NGN Main · Verified` : 'Add payout in Settings → Verification'}</span></span></div>
					<div class="flex flex-col gap-2 text-label-badge"><div class="flex items-center justify-between gap-2"><span class="text-on-surface-variant">Account status</span><span class="text-on-surface text-right">{savedPayoutReady ? 'Verified' : 'Not linked'}</span></div><div class="flex items-center justify-between gap-2"><span class="text-on-surface-variant">Gateway</span><span class="text-on-surface text-right">Paystack Split · KYC Tier 3</span></div><div class="flex items-center justify-between gap-2"><span class="text-on-surface-variant">Payout frequency</span><span class="text-on-surface text-right">T+2 rolling</span></div></div>
					<div class="rounded-lg bg-surface-container-low p-3 flex items-start gap-2"><Info class="w-4 h-4 text-primary shrink-0 mt-0.5" /><p class="text-label-badge text-on-surface-variant">No upfront listing fee. A 3% protocol charge is deducted at checkout.</p></div>
				</section>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
					<div class="flex items-center gap-2"><Share2 class="w-4.5 h-4.5 text-primary" /><h3 class="font-display text-headline-md text-on-surface">Distribution &amp; Discovery</h3></div>
					<label class="flex items-start gap-3 rounded-xl border border-surface-glass-border bg-surface-container-low p-3"><input type="checkbox" bind:checked={publishExplore} class="mt-0.5 w-4 h-4 accent-[#c0c1ff]" /><span><span class="block text-body-sm font-semibold text-on-surface">Publish to OWLTSIDE Explore</span><span class="block text-label-badge text-on-surface-variant pt-1">Feature on event discovery and location heatmaps.</span></span></label>
					<label class="flex items-start gap-3 rounded-xl border border-surface-glass-border bg-surface-container-low p-3"><input type="checkbox" bind:checked={broadcast} class="mt-0.5 w-4 h-4 accent-[#c0c1ff]" /><span><span class="block text-body-sm font-semibold text-on-surface">Instant organizer broadcast</span><span class="block text-label-badge text-on-surface-variant pt-1">Notify followers as soon as the event launches.</span></span></label>
					<div class="border-t border-surface-glass-border pt-3 flex flex-col gap-2"><span class="text-label-badge uppercase tracking-wider text-on-surface-variant">Launch timeline</span>
						<label class="rounded-xl border border-surface-glass-border bg-surface-container-low p-3 flex items-start gap-3"><input type="radio" name="launchModeMobile" checked={launchMode === 'now'} onchange={() => (launchMode = 'now')} class="mt-0.5 w-4 h-4 accent-[#c0c1ff]" /><span><span class="block text-body-sm font-semibold text-on-surface">Publish now · Instant</span><span class="block text-label-badge text-on-surface-variant pt-1">Contracts deploy immediately; visible in under 30 seconds.</span></span></label>
						<label class="rounded-xl border border-surface-glass-border bg-surface-container-low p-3 flex items-start gap-3"><input type="radio" name="launchModeMobile" checked={launchMode === 'staged'} onchange={() => (launchMode = 'staged')} class="mt-0.5 w-4 h-4 accent-[#c0c1ff]" /><span><span class="block text-body-sm font-semibold text-on-surface">Schedule staged drop</span><span class="block text-label-badge text-on-surface-variant pt-1">Set an embargo date, countdown page, and queue opening.</span></span></label>
					</div>
				</section>

				<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md">
					<h3 class="font-display text-headline-md text-on-surface">Review configured modules</h3>
					<div class="grid grid-cols-2 gap-2 pt-3">
						{#each [{ n: 1, label: 'Basics & venue' }, { n: 2, label: 'Ticket tiers' }, { n: 3, label: 'Schedule & lineup' }, { n: 4, label: 'Gate security' }] as item (item.n)}
							<button type="button" onclick={() => { step = item.n; scrollTo({ top: 0 }); }} class="min-h-10 px-3 rounded-lg border border-surface-glass-border bg-surface-container-low text-body-sm font-semibold text-on-surface flex items-center justify-between gap-2"><span>{item.label}</span><Pencil class="w-3.5 h-3.5 text-primary shrink-0" /></button>
						{/each}
					</div>
				</section>

				<button type="submit" class="h-12 rounded-full bg-primary text-on-primary text-body-md font-semibold flex items-center justify-center gap-2 glow-primary" disabled={!canContinue || tiers.length === 0}>
					<TrendingUp class="w-4 h-4" /> {editingEvent ? 'Save event changes' : 'Publish event'}
				</button>
			</form>
		{/if}
	</div>

	<!-- sticky nav -->
	<nav class="fixed bottom-0 left-0 w-full z-30 bg-surface/90 backdrop-blur-xl border-t border-surface-glass-border pb-safe">
		<div class="flex items-center gap-space-sm px-gutter py-3 md:max-w-3xl md:mx-auto w-full">
			<button class="h-12 px-6 rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface text-body-md font-medium flex items-center gap-2" onclick={back}>
				<ArrowLeft class="w-4 h-4" /> Back
			</button>
			{#if step < 5}
				<button class="flex-1 h-12 rounded-full bg-primary text-on-primary text-body-md font-semibold flex items-center justify-center gap-2 disabled:opacity-40" onclick={next} disabled={!canContinue}>
					Continue <ArrowRight class="w-4 h-4" />
				</button>
			{:else}
				<span class="flex-1 h-12 rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface-variant text-body-md flex items-center justify-center">
					Publish below ↑
				</span>
			{/if}
		</div>
	</nav>
</main>
</div>

{#if showInviteDialog}
	<div class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
		<div role="dialog" aria-modal="true" aria-labelledby="speaker-invite-title" class="w-full max-w-lg rounded-2xl border border-surface-glass-border bg-surface-container shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
			<div class="flex items-start justify-between gap-4"><div><h2 id="speaker-invite-title" class="font-display text-headline-md text-on-surface">Add Speaker/Performer</h2><p class="text-body-sm text-on-surface-variant pt-1">Enter an @username to invite a profile, or a plain name for display only.</p></div><button type="button" aria-label="Close invite dialog" onclick={() => (showInviteDialog = false)} class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"><X class="w-4 h-4" /></button></div>
			<label class="flex flex-col gap-2 text-label-badge text-on-surface-variant">Name or username<input type="text" bind:value={inviteName} oninput={() => { selectedInvitee = null; void searchInviteProfiles(); }} autocomplete="off" placeholder="@username or speaker name" class="w-full h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-body-md text-on-surface focus:outline-none focus:border-primary/50" /></label>
			{#if inviteName.trim().startsWith('@') && inviteName.trim().length > 1}
				<div class="rounded-xl border border-surface-glass-border bg-surface-container-low p-2 max-h-52 overflow-y-auto">
					{#if searchingProfiles}<p class="px-3 py-4 text-body-sm text-on-surface-variant">Searching profiles…</p>
					{:else if inviteMatches.length}
						{#each inviteMatches as profile (profile.id)}<button type="button" onclick={() => selectInvitee(profile)} class="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-container-high"><Avatar name={profile.name} color={profile.avatarColor} src={profile.avatarUrl} size="sm" /><span class="min-w-0 flex-1"><span class="block text-body-sm font-semibold text-on-surface truncate">{profile.name}</span><span class="block text-label-badge text-on-surface-variant truncate">@{profile.handle}{profile.city ? ` · ${profile.city}` : ''}</span></span>{#if selectedInvitee?.id === profile.id}<Check class="w-4 h-4 text-accent-emerald" />{/if}</button>{/each}
					{:else if inviteError}<p class="px-3 py-4 text-body-sm text-error">{inviteError}</p>
					{:else}<p class="px-3 py-4 text-body-sm text-on-surface-variant">No matching profiles. Choose a profile to queue an invite.</p>{/if}
				</div>
			{/if}
			<label class="flex flex-col gap-2 text-label-badge text-on-surface-variant">Role for this event<input type="text" bind:value={inviteRole} maxlength="80" placeholder="e.g. Keynote speaker, DJ, performer" class="w-full h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-body-md text-on-surface focus:outline-none focus:border-primary/50" /></label>
			{#if inviteError && !(inviteName.trim().startsWith('@') && inviteName.trim().length > 1 && !inviteMatches.length)}<p class="text-body-sm text-error">{inviteError}</p>{/if}
			<p class="text-label-badge text-on-surface-variant">Profile invites are notified when the event is published. Plain names are not linked to an account.</p>
			<div class="flex justify-end gap-2 pt-1"><button type="button" onclick={() => (showInviteDialog = false)} class="h-10 px-4 rounded-lg border border-surface-glass-border text-body-sm text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="button" disabled={!inviteCanSubmit} onclick={addSpeaker} class="h-10 px-4 rounded-lg bg-primary text-on-primary text-body-sm font-semibold disabled:opacity-40">{inviteName.trim().startsWith('@') ? 'Queue invite' : 'Add display name'}</button></div>
		</div>
	</div>
{/if}

<ImageCropSheet
	open={posterCropFile !== null}
	file={posterCropFile}
	title="Resize & crop poster"
	aspect={16 / 9}
	maxDimension={1600}
	confirmLabel="Use poster"
	hint="Pinch to zoom and drag to fit your 16:9 event poster, then confirm. Nothing changes until you tap &quot;Use poster&quot;."
	confirm={applyCroppedPoster}
	close={closePosterCrop}
/>

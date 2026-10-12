<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		Megaphone,
		Mic,
		Pencil,
		Plus,
		ScanBarcode,
		ShieldCheck,
		Trash2,
		TrendingUp
	} from '@lucide/svelte';
	import { formatMoney } from '$lib/utils/money';
	import { toast } from '$lib/state/toast.svelte';

	let { form } = $props();

	/* ── draft state ─────────────────────────────────────────── */
	let step = $state(1);
	let title = $state('Pulse AI Summit 2026');
	let date = $state('2026-11-20');
	let venue = $state('The Civic Centre');
	let city = $state('Lagos');
	let description = $state('');
	let tags = $state<string[]>(['AI & Machine Learning', 'Networking']);
	const tagPool = [
		'Music',
		'Art',
		'AI & Machine Learning',
		'Wellness',
		'Food & Drink',
		'Community',
		'Networking',
		'Pop-up Market'
	];

	let tiers = $state([
		{ name: 'Early Bird Access', price: 25000, capacity: 300, benefits: 'Front-row seating', editing: false },
		{ name: 'VIP Floor Pass', price: 75000, capacity: 100, benefits: 'Lounge + speaker meet', editing: false }
	]);

	let days = $state([
		{
			label: 'Nov 20',
			sessions: [
				{ time: '09:00', title: 'Doors & Registration', stage: 'Main Hall' },
				{ time: '10:30', title: 'Keynote: The Agentic Era', stage: 'Mainstage Hall A' }
			]
		}
	]);
	let dayIdx = $state(0);
	const stagePool = ['Mainstage Hall A', 'Tech Hall B', 'Breakout Rooms'];
	let newSession = $state({ time: '12:00', title: '', stage: 'Mainstage Hall A' });

	let gates = $state([
		{ name: 'Fast-Pass Turnstiles', staff: 4 },
		{ name: 'VIP & Press Entrance', staff: 2 }
	]);

	/* ── derived ─────────────────────────────────────────────── */
	const stepMeta: Record<number, { title: string; sub: string }> = {
		1: { title: 'Basics & Info', sub: 'Set the foundation of your event' },
		2: { title: 'Tickets & Pricing', sub: 'Set capacity, multi-currency display, and door access parameters' },
		3: { title: 'Schedule & Lineup', sub: 'Timeline sessions across days and stages' },
		4: { title: 'Gate Ops & Verification', sub: 'Configure lanes, staff and offline verification' },
		5: { title: 'Review & Launch', sub: 'Final checks before going live' }
	};
	const canContinue = $derived(
		step === 1 ? title.trim().length >= 3 && date !== '' && venue.trim() !== '' : true
	);
	const draftJson = $derived(
		JSON.stringify({
			title: title.trim(),
			tags,
			date,
			venue: venue.trim(),
			city,
			description: description.trim(),
			tiers: tiers.map(({ editing: _e, ...t }) => t),
			days: days.map((d) => ({ label: d.label, sessions: d.sessions })),
			gates
		})
	);
	const totalCapacity = $derived(tiers.reduce((s, t) => s + t.capacity, 0));

	/* ── helpers ─────────────────────────────────────────────── */
	function toggleTag(t: string) {
		if (tags.includes(t)) tags = tags.filter((x) => x !== t);
		else if (tags.length < 4) tags = [...tags, t];
		else toast('Max 4 tags selected', 'info');
	}
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
	function addDay() {
		const d = new Date(`${date}T00:00:00`);
		d.setDate(d.getDate() + days.length);
		const label = d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
		days = [...days, { label, sessions: [] }];
		dayIdx = days.length - 1;
	}
	function addSession() {
		if (!newSession.title.trim()) return;
		const d = days[dayIdx];
		d.sessions = [...d.sessions, { ...newSession, title: newSession.title.trim() }];
		newSession = { ...newSession, title: '' };
	}
</script>

<svelte:head><title>New Event Wizard • Owltside</title></svelte:head>

<main class="flex flex-col relative w-full pb-28 bg-surface min-h-dvh">
	<!-- top bar -->
	<header class="fixed top-0 left-0 w-full z-30 bg-surface/85 backdrop-blur-xl border-b border-surface-glass-border">
		<div class="flex items-center px-gutter h-16 md:max-w-3xl md:mx-auto w-full gap-2">
			<button onclick={back} aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
				<ArrowLeft class="w-5.5 h-5.5" />
			</button>
			<div class="flex flex-col flex-1 min-w-0">
				<h1 class="font-display text-headline-md text-on-surface truncate leading-tight">New Event Wizard</h1>
			</div>
			<span class="flex items-center gap-1 rounded-full bg-surface-container-high border border-outline-variant/30 px-2.5 py-1 text-label-badge text-on-surface-variant">
				<Check class="w-3 h-3 text-accent-emerald" /> Draft Autosaved
			</span>
		</div>
	</header>

	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md pt-20">
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
						<div class="flex items-center justify-between">
							<span class="text-body-sm text-on-surface-variant">Category & Community Tags</span>
							<span class="text-label-badge text-on-surface-variant">Max 4 Selected</span>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each tagPool as t (t)}
								<button
									class="px-3 py-1.5 rounded-full text-body-sm border transition-all {tags.includes(t) ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant'}"
									onclick={() => toggleTag(t)}
								>{t}</button>
							{/each}
						</div>
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						<span class="text-body-sm text-on-surface-variant">Event Date</span>
						<input type="date" bind:value={date} class="w-full px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md [color-scheme:dark]" />
					</div>
					<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
						<span class="text-body-sm text-on-surface-variant">Venue</span>
						<input type="text" bind:value={venue} placeholder="The Civic Centre" class="w-full px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
					</div>
				</div>

				<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-space-md flex flex-col gap-2">
					<span class="text-body-sm text-on-surface-variant">Description</span>
					<textarea bind:value={description} rows="4" maxlength="600" placeholder="What will attendees experience?" class="w-full px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
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
				<div class="flex flex-wrap gap-1.5">
					{#each stagePool as s (s)}
						<span class="px-2.5 py-1 rounded-full bg-surface-container-high border border-outline-variant/20 text-label-badge text-on-surface-variant">{s}</span>
					{/each}
				</div>
				<div class="flex flex-col gap-2">
					{#each days[dayIdx].sessions as s, i (i)}
						<div class="flex items-start gap-space-sm rounded-xl bg-surface-container border border-outline-variant/30 p-space-md">
							<span class="font-code text-body-md text-primary pt-0.5 w-14 flex-shrink-0">{s.time}</span>
							<div class="flex flex-col flex-1 min-w-0">
								<span class="text-body-md text-on-surface font-medium">{s.title}</span>
								<span class="text-body-sm text-on-surface-variant">{s.stage}</span>
							</div>
							<button aria-label="Remove session" class="text-on-surface-variant hover:text-error" onclick={() => (days[dayIdx].sessions = days[dayIdx].sessions.filter((_, j) => j !== i))}>
								<Trash2 class="w-4 h-4" />
							</button>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant py-4">No sessions on this day yet.</p>
					{/each}
				</div>
				<div class="rounded-xl bg-surface-container-low border border-dashed border-outline-variant/50 p-space-md grid grid-cols-[80px_1fr] gap-2">
					<input type="time" bind:value={newSession.time} class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
					<input type="text" bind:value={newSession.title} placeholder="Session title" class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
					<select bind:value={newSession.stage} class="col-span-2 px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md">
						{#each stagePool as s (s)}<option value={s}>{s}</option>{/each}
					</select>
					<button class="col-span-2 h-10 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center gap-1.5" onclick={addSession}>
						<Plus class="w-4 h-4" /> Add session
					</button>
				</div>
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
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2 min-w-0">
								<span class="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant/30 text-on-surface flex items-center justify-center flex-shrink-0">
									<ScanBarcode class="w-4.5 h-4.5" />
								</span>
								<span class="text-body-lg text-on-surface font-semibold truncate">Gate {i + 1}: {gate.name}</span>
							</div>
							<span class="text-label-badge text-on-surface-variant">QR • Manual</span>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex -space-x-2">
								{#each Array(Math.min(gate.staff, 4)) as _, s (s)}
									<span class="w-7 h-7 rounded-full bg-surface-container-highest border-2 border-surface-container text-label-badge text-on-surface-variant flex items-center justify-center">{s + 1}</span>
								{/each}
							</div>
							<div class="flex items-center gap-2">
								<button aria-label="Fewer staff" class="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface" onclick={() => (gate.staff = Math.max(1, gate.staff - 1))}>−</button>
								<span class="text-body-sm text-on-surface w-16 text-center">{gate.staff} staff</span>
								<button aria-label="More staff" class="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface" onclick={() => (gate.staff += 1)}>+</button>
							</div>
						</div>
					</div>
				{/each}
				<button class="h-12 rounded-full border border-dashed border-outline-variant/60 text-on-surface-variant text-body-md font-medium flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors" onclick={() => (gates = [...gates, { name: 'New Gate', staff: 2 }])}>
					<Plus class="w-4 h-4" /> Add gate
				</button>
			</div>

			<!-- STEP 5 -->
		{:else}
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
					};
				}}
				class="flex flex-col gap-space-sm"
			>
				<input type="hidden" name="draft" value={draftJson} />
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
						<span class="font-code text-label-badge text-on-surface-variant">ID: EVT-2026-LGS</span>
					</div>
					<div class="flex items-center gap-space-md">
						<div class="w-16 h-16 rounded-xl bg-gradient-to-br from-[#2b2a3f] to-[#14131f] border border-outline-variant/30 flex items-center justify-center flex-shrink-0">
							<Mic class="w-7 h-7 text-primary" />
						</div>
						<div class="flex flex-col min-w-0">
							<span class="font-display text-headline-md text-on-surface truncate">{title}</span>
							<span class="text-body-sm text-on-surface-variant truncate">{date} • {venue}, {city}</span>
						</div>
					</div>
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
				<button type="submit" class="h-12 rounded-full bg-primary text-on-primary text-body-md font-semibold flex items-center justify-center gap-2 glow-primary" disabled={!canContinue || tiers.length === 0}>
					<TrendingUp class="w-4 h-4" /> Publish event
				</button>
			</form>
		{/if}
	</div>

	<!-- sticky nav -->
	<nav class="fixed bottom-0 left-0 w-full z-30 bg-surface/90 backdrop-blur-xl border-t border-surface-glass-border">
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

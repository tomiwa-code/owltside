<script lang="ts">
	import {
		BadgeCheck,
		CalendarDays,
		Edit,
		Globe,
		Link2,
		Settings2,
		Share2,
		WifiOff
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Sheet from '$components/Sheet.svelte';
	import { page } from '$app/state';
	import { follows } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate } from '$lib/utils/dates';

	let { data } = $props();
	const session = $derived(page.data.session);
	const name = $derived(session?.name ?? 'Guest Explorer');
	const handle = $derived(session?.handle ?? 'guest');

	const upcoming = $derived(
		(data.tickets ?? []).filter((t) => t.status === 'valid' && new Date(t.eventStartsAt) > new Date())
	);

	let calendarOpen = $state(false);
	let editOpen = $state(false);
	let editName = $state(name);
	let editBio = $state('Chasing good sound and good software across Lagos.');

	// month grid for the current month
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday start
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const monthLabel = now.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
	const eventDays = $derived(
		new Set(
			upcoming
				.filter((t) => {
					const d = new Date(t.eventStartsAt);
					return d.getMonth() === month && d.getFullYear() === year;
				})
				.map((t) => new Date(t.eventStartsAt).getDate())
		)
	);

	function share() {
		void navigator.clipboard?.writeText(`https://owltside.app/@${handle}`);
		toast('Profile link copied', 'success');
	}
</script>

<svelte:head><title>Profile • Owltside</title></svelte:head>

<header class="fixed top-0 inset-x-0 z-50 pt-safe md:left-20">
	<div class="h-16 px-gutter md:max-w-3xl md:mx-auto flex items-center justify-between">
		<span class="font-display text-headline-md text-on-surface">Profile</span>
		<a href="/settings" aria-label="Settings" class="w-9 h-9 rounded-full bg-surface-container-high/80 backdrop-blur-md flex items-center justify-center text-on-surface hover:text-primary transition-all active:scale-95 shadow-lg">
			<Settings2 class="w-4.5 h-4.5" />
		</a>
	</div>
</header>

<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full relative md:max-w-3xl md:mx-auto">
		<!-- cover -->
		<div class="relative w-full h-44 overflow-hidden">
			<div class="w-full h-full" style="background: linear-gradient(140deg, #312e81 0%, #1e1b4b 45%, #0b1326 100%);"></div>
			<div class="absolute inset-0 bg-gradient-to-b from-surface/20 via-surface/60 to-surface"></div>
			<div class="absolute top-3 left-4 flex items-center gap-2 bg-surface-container/70 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md">
				<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
				<span class="font-code text-label-code text-accent-emerald tracking-wide uppercase">PWA Sync</span>
			</div>
		</div>

		<div class="px-gutter -mt-14 relative z-10 flex flex-col">
			<div class="flex items-end justify-between">
				<div class="relative">
					<div class="w-24 h-24 rounded-full overflow-hidden shadow-2xl p-0.5 bg-gradient-to-tr from-primary to-accent-emerald">
						<div class="w-full h-full rounded-full bg-surface-container flex items-center justify-center">
							<Avatar name={name} size="xl" />
						</div>
					</div>
					{#if session}
						<span class="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-md">
							<BadgeCheck class="w-4 h-4" />
						</span>
					{/if}
				</div>
				<span class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-label-badge shadow-sm mb-2">
					<WifiOff class="w-3.5 h-3.5 text-accent-emerald" /> Ticket Vault Ready
				</span>
			</div>

			<div class="mt-3 flex flex-col">
				<div class="flex items-center flex-wrap gap-2">
					<h1 class="font-display text-headline-lg-mobile text-on-surface tracking-tight">{name}</h1>
					{#if session}
						<span class="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container text-label-badge">
							<BadgeCheck class="w-3 h-3" /> Verified Member
						</span>
					{:else}
						<span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-label-badge">Guest</span>
					{/if}
				</div>
				<p class="font-code text-label-code text-outline mt-0.5">@{handle} • Lagos & Global Remote</p>
			</div>

			<p class="text-body-md text-on-surface-variant mt-2.5 leading-relaxed">{editBio}</p>

			<div class="flex items-center gap-4 mt-2.5 flex-wrap">
				<span class="inline-flex items-center gap-1 text-label-badge text-tertiary">
					<Globe class="w-3.5 h-3.5" /> owltside.app/@{handle}
				</span>
				<span class="inline-flex items-center gap-1 text-label-badge text-on-surface-variant">
					<Link2 class="w-3.5 h-3.5" /> @{handle}
				</span>
			</div>

			<!-- stats -->
			<div class="grid grid-cols-3 gap-2 mt-4 bg-surface-container-low rounded-xl p-3 shadow-md">
				<button class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors group active:scale-95">
					<span class="font-display text-headline-md text-primary font-semibold">{upcoming.length + (data.tickets?.length ?? 0)}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Tickets</span>
				</button>
				<button class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors group active:scale-95">
					<span class="font-display text-headline-md text-on-surface font-semibold">{follows.value.length + 86}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Following</span>
				</button>
				<button class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors group active:scale-95">
					<span class="font-display text-headline-md text-on-surface font-semibold">342</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Followers</span>
				</button>
			</div>

			<!-- actions -->
			<div class="grid grid-cols-12 gap-2 mt-3.5">
				<button class="col-span-5 h-11 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm" onclick={() => (editOpen = true)}>
					<Edit class="w-4 h-4" /><span>Edit Profile</span>
				</button>
				<button class="col-span-4 h-11 px-3 rounded-full bg-primary-container text-on-primary-container text-label-badge flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all" onclick={() => (calendarOpen = !calendarOpen)}>
					<CalendarDays class="w-4 h-4" /><span>Calendar</span>
				</button>
				<button aria-label="Share Profile" class="col-span-3 h-11 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm" onclick={share}>
					<Share2 class="w-4 h-4" />
				</button>
			</div>

			<!-- calendar popover -->
			{#if calendarOpen}
				<div class="mt-3 bg-surface-container-high rounded-2xl p-4 shadow-xl transition-all">
					<div class="flex items-center justify-between pb-3">
						<span class="flex items-center gap-2">
							<CalendarDays class="w-4.5 h-4.5 text-primary" />
							<span class="font-display text-headline-md text-on-surface">{monthLabel}</span>
						</span>
						<span class="font-code text-label-code px-2 py-0.5 rounded bg-primary/20 text-primary">{eventDays.size} Events</span>
					</div>
					<div class="grid grid-cols-7 gap-1 text-center text-label-badge text-outline py-1">
						{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<span>{d}</span>{/each}
					</div>
					<div class="grid grid-cols-7 gap-1 text-center text-body-sm text-on-surface-variant pt-1">
						{#each Array(firstDay) as _, i (i)}<span class="py-1 text-outline/40"></span>{/each}
						{#each Array(daysInMonth) as _, i (i)}
							{@const day = i + 1}
							<span class="py-1 rounded {eventDays.has(day) ? 'bg-primary text-on-primary font-bold shadow-sm' : 'bg-surface-container'}">{day}</span>
						{/each}
					</div>
					<div class="mt-3 pt-2 flex items-center gap-1.5 text-on-surface-variant text-label-badge">
						<span class="w-2 h-2 rounded-full bg-primary"></span>
						{#each upcoming.slice(0, 2) as t}
							<span>{fmtDate(t.eventStartsAt)}: {t.eventTitle}</span>
						{:else}
							<span>No events this month</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- upcoming mini list -->
			<div class="mt-6 flex flex-col gap-space-xs pb-6">
				<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Next up</span>
				{#each upcoming.slice(0, 3) as t (t.id)}
					<a href="/tickets/{t.id}" class="flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
						<span class="min-w-0">
							<span class="block text-body-md text-on-surface font-semibold truncate">{t.eventTitle}</span>
							<span class="block text-body-sm text-on-surface-variant">{fmtDate(t.eventStartsAt)} • {t.venue}</span>
						</span>
						<span class="text-label-badge text-tertiary shrink-0">{t.tierName}</span>
					</a>
				{:else}
					<p class="text-body-sm text-on-surface-variant">No upcoming passes — the city is waiting.</p>
				{/each}
			</div>
		</div>
	</div>
</main>

<Sheet open={editOpen} title="Edit profile" close={() => (editOpen = false)}>
	{#snippet footer()}
		<button class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md" onclick={() => { editOpen = false; toast('Profile updated', 'success'); }}>
			Save changes
		</button>
	{/snippet}
	<div class="flex flex-col gap-space-md">
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Display name
			<input bind:value={editName} class="h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
		</label>
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Bio
			<textarea bind:value={editBio} rows="3" class="px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
		</label>
	</div>
</Sheet>

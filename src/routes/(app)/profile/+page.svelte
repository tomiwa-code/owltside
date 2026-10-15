<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		BadgeCheck,
		Bell,
		BookmarkCheck,
		CalendarDays,
		ChevronLeft,
		ChevronRight,
		Copy,
		Edit,
		Globe,
		Link2,
		QrCode,
		RefreshCw,
		Search,
		Settings2,
		Share2,
		ShieldCheck,
		Users,
		WifiOff
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import SavedEventsList from '$components/SavedEventsList.svelte';
	import Sheet from '$components/Sheet.svelte';
	import { mockProfiles } from '$lib/data/mock-profiles';
	import { page } from '$app/state';
	import { bookmarks, follows, toggleIn } from '$lib/state/prefs.svelte';
	import { profileAppearance, profileDraft } from '$lib/state/profile.svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate, fmtTime } from '$lib/utils/dates';
	import { NIGERIAN_STATES } from '$lib/constants/nigeria-states';

	let { data } = $props();
	const session = $derived(page.data.session);
	const isFullyVerified = $derived(!!session && Object.values(appSettings.value.verification).every(Boolean));
	const hasProfileDraft = $derived(profileDraft.value.hasChanges);
	const name = $derived(hasProfileDraft ? profileDraft.value.name : (data.profile?.name ?? session?.name ?? 'Guest Explorer'));
	const handle = $derived(hasProfileDraft ? profileDraft.value.username : (data.profile?.handle ?? session?.handle ?? 'guest'));
	const bio = $derived(hasProfileDraft ? profileDraft.value.bio : (data.profile?.bio ?? 'Chasing good sound and good software across Lagos.'));
	const city = $derived(hasProfileDraft ? profileDraft.value.city : (data.profile?.city ?? 'Lagos'));
	const profileLink = $derived(hasProfileDraft ? profileDraft.value.link : (data.profile?.link ?? ''));
	const interests = $derived(hasProfileDraft ? profileDraft.value.interests : (data.profile?.interests ?? []));
	const avatarPhoto = $derived(profileAppearance.value.avatarData || data.profile?.avatarUrl || session?.avatarUrl || null);
	const bannerPhoto = $derived(profileAppearance.value.bannerData || data.profile?.bannerUrl || null);
	const avatarImageStyle = $derived(`transform: scale(${profileAppearance.value.avatarZoom}); object-position: 50% ${profileAppearance.value.avatarCropY}%;`);
	const bannerImageStyle = $derived(`transform: scale(${profileAppearance.value.bannerZoom}); object-position: 50% ${profileAppearance.value.bannerCropY}%;`);
	const lastUsernameChange = $derived(profileDraft.value.usernameChangedAt ?? data.profile?.usernameChangedAt ?? session?.usernameChangedAt ?? null);
	const usernameCooldownDays = $derived(lastUsernameChange ? Math.max(0, Math.ceil((new Date(lastUsernameChange).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))) : 0);

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const savedEvents = $derived((data.events ?? []).filter((event) => bookmarks.value.includes(event.id)));
	let profileTab = $state<'calendar' | 'saved'>('calendar');

	const upcoming = $derived(
		(data.tickets ?? []).filter((t) => t.status === 'valid' && new Date(t.eventStartsAt) > new Date())
	);

	let calendarOpen = $state(false);
	let editOpen = $state(false);
	let editName = $state('');
	let editUsername = $state('');
	let editBio = $state('');
	let editCity = $state('');
	let editLink = $state('');
	let editInterests = $state<string[]>([]);
	let editError = $state('');
	let followersOpen = $state(false);
	let followingOpen = $state(false);

	let followingProfiles = $derived.by(() => {
		const followed = new Set(follows.value);
		const matched = mockProfiles.filter((p) => followed.has(p.id));
		return matched.length ? matched : mockProfiles.slice(0, 4);
	});
	let followersProfiles = $derived(mockProfiles.slice().reverse());
	const interestChoices = ['Afrobeats', 'Amapiano', 'Live music', 'Nightlife', 'Tech', 'Art & design', 'Comedy', 'Food', 'Fashion', 'Film', 'Workshops', 'Fitness'];

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

	// ── desktop calendar-hero state ──
	let monthOffset = $state(0);
	let selectedDay = $state<number | null>(null);
	const view = $derived(new Date(year, month + monthOffset, 1));
	const viewLabel = $derived(view.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }));
	const viewFirst = $derived((view.getDay() + 6) % 7);
	const viewDays = $derived(new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate());
	const todayInView = $derived(view.getFullYear() === year && view.getMonth() === month);
	const activeDay = $derived(selectedDay ?? (todayInView ? now.getDate() : null));
	const passesOn = (d: number) =>
		upcoming.filter((t) => {
			const s = new Date(t.eventStartsAt);
			return (
				s.getFullYear() === view.getFullYear() && s.getMonth() === view.getMonth() && s.getDate() === d
			);
		});
	const monthCount = $derived(
		upcoming.filter((t) => {
			const s = new Date(t.eventStartsAt);
			return s.getFullYear() === view.getFullYear() && s.getMonth() === view.getMonth();
		}).length
	);
	const daySchedule = $derived(activeDay ? passesOn(activeDay) : []);
	const activeLabel = $derived(
		activeDay ? fmtDate(new Date(view.getFullYear(), view.getMonth(), activeDay, 12).toISOString()) : ''
	);

	const vaultRows = $derived([
		{ icon: WifiOff, label: 'Offline Cache', value: 'Enabled' },
		{ icon: QrCode, label: 'Passes On Device', value: String(data.tickets?.length ?? 0) },
		{ icon: ShieldCheck, label: 'Gate Biometrics', value: 'Active' },
		{ icon: RefreshCw, label: 'Last Vault Sync', value: '12m ago' }
	]);

	function share() {
		void navigator.clipboard?.writeText(`https://owltside.app/@${handle}`);
		toast('Profile link copied', 'success');
	}
	async function copyText(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			toast(`${label} copied`, 'success');
		} catch {
			toast(label, 'info');
		}
	}

	function openEdit() {
		editName = name;
		editUsername = handle;
		editBio = bio;
		editCity = (NIGERIAN_STATES as readonly string[]).includes(city) ? city : 'Lagos';
		editLink = profileLink;
		editInterests = [...interests];
		editError = '';
		editOpen = true;
	}

	function toggleInterest(interest: string) {
		editInterests = editInterests.includes(interest)
			? editInterests.filter((item) => item !== interest)
			: [...editInterests, interest].slice(0, 12);
	}

	async function handleImageUpload(event: Event, kind: 'avatar' | 'banner') {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toast('Choose an image file to upload.', 'error');
			return;
		}
		try {
			const bitmap = await createImageBitmap(file);
			const maxDimension = kind === 'avatar' ? 1200 : 1800;
			const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(bitmap.width * scale));
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Image canvas is unavailable');
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			bitmap.close();
			const image = canvas.toDataURL('image/jpeg', 0.82);
			if (kind === 'avatar') profileAppearance.value.avatarData = image;
			else profileAppearance.value.bannerData = image;
			toast(`${kind === 'avatar' ? 'Profile photo' : 'Banner'} uploaded. Adjust the crop before saving.`, 'success');
		} catch {
			toast('This image could not be resized on your device.', 'error');
		} finally {
			input.value = '';
		}
	}

	function handleProfileEnhance() {
		return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			await update();
			if (result.type === 'success') {
				const saved = result.data as { success?: boolean; name?: string; username?: string; bio?: string; city?: string; link?: string; interests?: string[]; usernameChangedAt?: string | null };
				if (saved.success) {
					profileDraft.value = {
						hasChanges: true,
						name: saved.name ?? editName,
						username: saved.username ?? editUsername,
						bio: saved.bio ?? editBio,
						city: saved.city ?? editCity,
						link: saved.link ?? editLink,
						interests: saved.interests ?? editInterests,
						usernameChangedAt: saved.usernameChangedAt ?? profileDraft.value.usernameChangedAt
					};
					editError = '';
					editOpen = false;
					toast('Profile updated', 'success');
				} else {
					editError = 'Your profile could not be saved.';
				}
			} else if (result.type === 'failure') {
				editError = (result.data as { error?: string })?.error ?? 'Your profile could not be saved.';
			}
		};
	}
</script>

<svelte:head><title>Profile • Owltside</title></svelte:head>

<!-- ── desktop (md+) profile & pass portfolio in the shipped console design
     language (design source unavailable this turn — extrapolated); mobile
     profile below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
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
					['/organizer', 'Organizer']
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
			<span class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, gates, artists…</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</span>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7E3…A14</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">GATE_PASS_ACTIVE</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name={name} src={avatarPhoto} imageStyle={avatarImageStyle} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-2 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
				<span>Identity_Node</span>
				<span class="text-outline-variant">/</span>
				<span>Public_Profile</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Profile & Pass Portfolio</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Public identity, vault readiness and the pass calendar for this access node.</p>
		</div>
		<div class="flex items-center gap-3">
			<a href="/settings" aria-label="Settings" class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
				<Settings2 class="w-4 h-4" />
			</a>
			<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={share}>
				<Share2 class="w-4 h-4 text-on-surface-variant" /><span>Share Profile</span>
			</button>
			<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-on-surface text-surface-base text-body-sm font-semibold hover:opacity-90 transition-opacity" onclick={openEdit}>
				<Edit class="w-4 h-4" /><span>Edit Profile</span>
			</button>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8">
		<section class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
			<div class="relative h-32 overflow-hidden" style="background: linear-gradient(140deg, #312e81 0%, #1e1b4b 45%, #0b1326 100%);">
				{#if bannerPhoto}<img src={bannerPhoto} alt="Profile banner" class="absolute inset-0 w-full h-full object-cover" style={bannerImageStyle} />{/if}
				<div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-container"></div>
				<span class="absolute top-3 right-4 {MONO} text-on-surface-variant">Node 0x7E3 • {city}</span>
			</div>
			<div class="px-6 pb-6 flex flex-wrap items-start gap-6 justify-between">
				<span class="flex items-start gap-5 -mt-10 relative min-w-0">
					<span class="relative shrink-0">
						<span class="block w-24 h-24 rounded-full overflow-hidden shadow-2xl p-0.5 bg-gradient-to-tr from-primary to-accent-emerald">
							<span class="block w-full h-full rounded-full bg-surface-container flex items-center justify-center">
								<Avatar name={name} src={avatarPhoto} imageStyle={avatarImageStyle} size="xl" />
							</span>
						</span>
					</span>
					<span class="min-w-0 pt-1">
						<span class="flex items-center flex-wrap gap-2">
							<span class="font-display text-headline-lg text-on-surface tracking-tight">{name}</span>
							{#if isFullyVerified}<BadgeCheck class="w-5 h-5 text-tertiary shrink-0" aria-label="Verified member" />{/if}
							{#if !session}
								<span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant {MONO}">Guest</span>
							{/if}
						</span>
						<span class="{MONO} text-outline block mt-1.5">@{handle} • {city}</span>
						<span class="block text-body-md text-on-surface-variant mt-2 leading-relaxed max-w-xl">{bio}</span>
						{#if interests.length}<span class="flex flex-wrap gap-1.5 mt-2">{#each interests as interest (interest)}<span class="text-label-badge px-2 py-1 rounded-full bg-primary/10 text-primary">{interest}</span>{/each}</span>{/if}
						<span class="flex items-center gap-4 mt-2.5 flex-wrap">
							<span class="inline-flex items-center gap-1.5 {MONO} text-tertiary"><Globe class="w-3.5 h-3.5" /> owltside.app/@{handle}</span>
							{#if profileLink}<a href={profileLink} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 {MONO} text-on-surface-variant hover:text-primary"><Link2 class="w-3.5 h-3.5" /> {profileLink}</a>{:else}<span class="inline-flex items-center gap-1.5 {MONO} text-on-surface-variant"><Link2 class="w-3.5 h-3.5" /> @{handle}</span>{/if}
						</span>
					</span>
				</span>
				<span class="flex items-center gap-3 flex-wrap">
					<span class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center">
						<span class="block font-display text-headline-md font-semibold text-primary">{upcoming.length + (data.tickets?.length ?? 0)}</span>
						<span class="{MONO} text-on-surface-variant block mt-0.5">Tickets</span>
					</span>
					<button type="button" onclick={() => (followingOpen = true)} class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center hover:bg-surface-container-high transition-colors text-left">
						<span class="block font-display text-headline-md font-semibold text-on-surface">{follows.value.length + 86}</span>
						<span class="{MONO} text-on-surface-variant block mt-0.5">Following</span>
					</button>
					<button type="button" onclick={() => (followersOpen = true)} class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center hover:bg-surface-container-high transition-colors text-left">
						<span class="block font-display text-headline-md font-semibold text-on-surface">342</span>
						<span class="{MONO} text-on-surface-variant block mt-0.5">Followers</span>
					</button>
				</span>
			</div>
		</section>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-5">
		<div role="tablist" aria-label="Profile sections" class="inline-flex items-center gap-1 rounded-full border border-surface-glass-border bg-surface-container p-1">
			<button type="button" role="tab" aria-selected={profileTab === 'calendar'} onclick={() => (profileTab = 'calendar')} class="h-10 px-4 rounded-full text-body-sm font-semibold flex items-center gap-2 transition-colors {profileTab === 'calendar' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}"><CalendarDays class="w-4 h-4" />Calendar</button>
			<button type="button" role="tab" aria-selected={profileTab === 'saved'} onclick={() => (profileTab = 'saved')} class="h-10 px-4 rounded-full text-body-sm font-semibold flex items-center gap-2 transition-colors {profileTab === 'saved' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}"><BookmarkCheck class="w-4 h-4" />Saved <span class="font-code text-label-badge">{savedEvents.length}</span></button>
		</div>
	</div>
	{#if profileTab === 'saved'}
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6"><SavedEventsList events={savedEvents} /></div>
	{:else}
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="flex items-center gap-2.5">
						<CalendarDays class="w-4.5 h-4.5 text-primary" />
						<span class="font-display text-headline-md text-on-surface">{viewLabel}</span>
					</span>
					<span class="flex items-center gap-2">
						<button class="w-9 h-9 rounded-md bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" aria-label="Previous month" onclick={() => { monthOffset -= 1; selectedDay = null; }}>
							<ChevronLeft class="w-4 h-4" />
						</button>
						<button class="h-9 px-3 rounded-md bg-surface-container-high border border-surface-glass-border {MONO} text-on-surface-variant hover:text-on-surface transition-colors" onclick={() => { monthOffset = 0; selectedDay = null; }}>
							Today
						</button>
						<button class="w-9 h-9 rounded-md bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" aria-label="Next month" onclick={() => { monthOffset += 1; selectedDay = null; }}>
							<ChevronRight class="w-4 h-4" />
						</button>
					</span>
				</div>
				<div class="grid grid-cols-7 gap-1.5 text-center {MONO} text-outline py-2 mt-3">
					{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<span>{d}</span>{/each}
				</div>
				<div class="grid grid-cols-7 gap-1.5">
					{#each Array(viewFirst) as _, i (i)}<span></span>{/each}
					{#each Array(viewDays) as _, i (i)}
						{@const day = i + 1}
						{@const evs = passesOn(day)}
						{@const isSel = activeDay === day}
						{@const isToday = todayInView && now.getDate() === day}
						<button
							class="h-14 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors {isSel ? 'bg-primary text-on-primary' : evs.length ? 'bg-surface-container-high/70 text-on-surface hover:bg-surface-container-high' : 'bg-surface-container-high/40 text-on-surface-variant hover:bg-surface-container-high/60'} {isToday && !isSel ? 'ring-1 ring-primary/50' : ''}"
							onclick={() => (selectedDay = day)}
							aria-label="{viewLabel} day {day}{evs.length ? `, ${evs.length} events` : ''}"
						>
							<span class="text-body-sm {isSel ? 'font-bold' : ''}">{day}</span>
							{#if evs.length}<span class="w-1.5 h-1.5 rounded-full {isSel ? 'bg-on-primary' : 'bg-primary'}"></span>{/if}
						</button>
					{/each}
				</div>
				<div class="flex items-center gap-4 mt-4 pt-3 border-t border-surface-glass-border {MONO} text-on-surface-variant">
					<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-primary"></span> Event day</span>
					<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ring-1 ring-primary/60"></span> Today</span>
					<span class="ml-auto">{monthCount} Events This Month</span>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="flex items-center gap-2.5">
						<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
						<span class="font-display text-headline-md text-on-surface">Day Schedule{activeLabel ? ` — ${activeLabel}` : ''}</span>
					</span>
					<span class="{MONO} text-on-surface-variant">{daySchedule.length} Passes</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each daySchedule as t (t.id)}
						<a href="/tickets/{t.id}" class="flex items-center gap-4 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-3 hover:bg-surface-container-high transition-colors">
							<span class="{MONO} text-on-surface shrink-0 w-16">{fmtTime(t.eventStartsAt)}</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-md font-semibold text-on-surface truncate">{t.eventTitle}</span>
								<span class="block text-body-sm text-on-surface-variant truncate">{t.venue}</span>
							</span>
							<span class="{MONO} px-2 py-1 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant shrink-0">{t.tierName}</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant py-6 text-center">No passes on this day — pick a marked date or explore new events.</p>
					{/each}
				</div>
			</section>
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Next Up</h2>
					<span class="{MONO} text-on-surface-variant">{upcoming.length} Valid</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each upcoming.slice(0, 4) as t (t.id)}
						<a href="/tickets/{t.id}" class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5 hover:bg-surface-container-high transition-colors">
							<span class="w-10 h-10 rounded-md bg-surface-container-highest border border-surface-glass-border flex flex-col items-center justify-center shrink-0">
								<span class="font-code text-[9px] tracking-[0.14em] text-on-surface-variant uppercase">{new Date(t.eventStartsAt).toLocaleDateString('en-NG', { month: 'short' })}</span>
								<span class="font-display text-body-sm font-bold text-on-surface leading-4">{new Date(t.eventStartsAt).getDate()}</span>
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-sm font-medium text-on-surface truncate">{t.eventTitle}</span>
								<span class="block text-xs text-on-surface-variant truncate">{fmtDate(t.eventStartsAt)} • {t.tierName}</span>
							</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No upcoming passes — the city is waiting.</p>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Vault Readiness</h2>
					<span class="{MONO} text-on-surface-variant">Local_Cache</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each vaultRows as row (row.label)}
						{@const VIcon = row.icon}
						<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
							<span class="w-8 h-8 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
								<VIcon class="w-4 h-4 text-on-surface-variant" />
							</span>
							<span class="flex-1 text-body-sm font-medium text-on-surface">{row.label}</span>
							<span class="{MONO} text-accent-emerald">{row.value}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Identity Links</h2>
					<span class="{MONO} text-on-surface-variant">Public_DNS</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<Globe class="w-4 h-4 text-tertiary shrink-0" />
						<span class="flex-1 min-w-0 {MONO} text-on-surface truncate">owltside.app/@{handle}</span>
						<button class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0" aria-label="Copy profile link" onclick={() => copyText(`https://owltside.app/@${handle}`, 'Profile link')}>
							<Copy class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<Link2 class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 min-w-0 {MONO} text-on-surface truncate">@{handle}</span>
						<button class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0" aria-label="Copy handle" onclick={() => copyText(`@${handle}`, 'Handle')}>
							<Copy class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						<span class="flex-1 min-w-0 text-body-sm text-on-surface truncate">{session?.email ?? 'No email (guest)'}</span>
						<span class="{MONO} px-2 py-0.5 rounded text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 shrink-0">Verified</span>
					</div>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<h2 class="font-display text-headline-md text-on-surface">Quick Routes</h2>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each [
						['/tickets', 'Ticket Wallet & Passes'],
						['/organizer', 'Organizer Console'],
						['/settings', 'Settings & Identity']
					] as [href, label]}
						<a {href} class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5 hover:bg-surface-container-high transition-colors">
							<span class="text-body-sm font-medium text-on-surface">{label}</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{/each}
				</div>
			</section>
		</div>
	</div>

	{/if}
	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">
	<header class="fixed top-0 inset-x-0 z-50 pt-safe md:left-20">
		<div class="h-16 px-gutter md:max-w-3xl md:mx-auto flex items-center justify-between">
			<span class="font-display text-headline-md text-on-surface">Profile</span>
			<a href="/settings" aria-label="Settings" class="w-9 h-9 rounded-full bg-surface-container-high/80 backdrop-blur-md flex items-center justify-center text-on-surface hover:text-primary transition-all active:scale-95 shadow-lg">
				<Settings2 class="w-4.5 h-4.5" />
			</a>
		</div>
	</header>

	<main class="flex flex-col relative w-full pt-mobile-header pb-28 md:pb-16 bg-surface min-h-dvh">
		<div class="flex flex-col w-full relative md:max-w-3xl md:mx-auto">
			<!-- cover -->
			<div class="relative w-full h-44 overflow-hidden" style="background: linear-gradient(140deg, #312e81 0%, #1e1b4b 45%, #0b1326 100%);">
				{#if bannerPhoto}<img src={bannerPhoto} alt="Profile banner" class="absolute inset-0 w-full h-full object-cover" style={bannerImageStyle} />{/if}
				<div class="absolute inset-0 bg-gradient-to-b from-surface/20 via-surface/60 to-surface"></div>
			</div>

			<div class="px-gutter -mt-14 relative z-10 flex flex-col">
				<div class="flex items-end justify-between">
					<div class="relative">
						<div class="w-24 h-24 rounded-full overflow-hidden shadow-2xl p-0.5 bg-gradient-to-tr from-primary to-accent-emerald">
							<div class="w-full h-full rounded-full bg-surface-container flex items-center justify-center">
								<Avatar name={name} src={avatarPhoto} imageStyle={avatarImageStyle} size="xl" />
							</div>
						</div>
					</div>
				</div>

				<div class="mt-3 flex flex-col">
					<div class="flex items-center flex-wrap gap-2">
							<h1 class="font-display text-headline-lg-mobile text-on-surface tracking-tight">{name}</h1>
						{#if isFullyVerified}<BadgeCheck class="w-5 h-5 text-tertiary shrink-0" aria-label="Verified member" />{/if}
						{#if !session}
							<span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-label-badge">Guest</span>
						{/if}
					</div>
					<p class="font-code text-label-code text-outline mt-0.5">@{handle} • {city}</p>
				</div>

				<p class="text-body-md text-on-surface-variant mt-2.5 leading-relaxed">{bio}</p>
				{#if interests.length}<div class="flex flex-wrap gap-1.5 mt-2">{#each interests as interest (interest)}<span class="text-label-badge px-2 py-1 rounded-full bg-primary/10 text-primary">{interest}</span>{/each}</div>{/if}

				<div class="flex items-center gap-4 mt-2.5 flex-wrap">
					<span class="inline-flex items-center gap-1 text-label-badge text-tertiary">
						<Globe class="w-3.5 h-3.5" /> owltside.app/@{handle}
					</span>
					{#if profileLink}<a href={profileLink} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-label-badge text-on-surface-variant hover:text-primary"><Link2 class="w-3.5 h-3.5" /> {profileLink}</a>{:else}<span class="inline-flex items-center gap-1 text-label-badge text-on-surface-variant"><Link2 class="w-3.5 h-3.5" /> @{handle}</span>{/if}
				</div>

				<!-- stats -->
				<div class="grid grid-cols-3 gap-2 mt-4 bg-surface-container-low rounded-xl p-3 shadow-md">
					<div class="flex flex-col items-center justify-center p-1 rounded-lg">
						<span class="font-display text-headline-md text-primary font-semibold">{upcoming.length + (data.tickets?.length ?? 0)}</span>
						<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Tickets</span>
					</div>
					<button type="button" onclick={() => (followingOpen = true)} class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors active:scale-95">
						<span class="font-display text-headline-md text-on-surface font-semibold">{follows.value.length + 86}</span>
						<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Following</span>
					</button>
					<button type="button" onclick={() => (followersOpen = true)} class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors active:scale-95">
						<span class="font-display text-headline-md text-on-surface font-semibold">342</span>
						<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Followers</span>
					</button>
				</div>

				<!-- actions -->
				<div class="grid grid-cols-12 gap-2 mt-3.5">
					<button class="col-span-5 h-11 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm" onclick={openEdit}>
						<Edit class="w-4 h-4" /><span>Edit Profile</span>
					</button>
					<button class="col-span-4 h-11 px-3 rounded-full bg-primary-container text-on-primary-container text-label-badge flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all" onclick={() => (calendarOpen = !calendarOpen)}>
						<CalendarDays class="w-4 h-4" /><span>Calendar</span>
					</button>
					<button aria-label="Share Profile" class="col-span-3 h-11 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm" onclick={share}>
						<Share2 class="w-4 h-4" />
					</button>
				</div>

				<div role="tablist" aria-label="Profile sections" class="grid grid-cols-2 gap-1 mt-4 rounded-full border border-surface-glass-border bg-surface-container-low p-1">
					<button type="button" role="tab" aria-selected={profileTab === 'calendar'} onclick={() => (profileTab = 'calendar')} class="h-10 rounded-full text-body-sm font-semibold flex items-center justify-center gap-2 transition-colors {profileTab === 'calendar' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}"><CalendarDays class="w-4 h-4" />Calendar</button>
					<button type="button" role="tab" aria-selected={profileTab === 'saved'} onclick={() => (profileTab = 'saved')} class="h-10 rounded-full text-body-sm font-semibold flex items-center justify-center gap-2 transition-colors {profileTab === 'saved' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}"><BookmarkCheck class="w-4 h-4" />Saved <span class="font-code text-label-badge">{savedEvents.length}</span></button>
				</div>
				{#if profileTab === 'saved'}
					<div class="mt-4 pb-6"><SavedEventsList events={savedEvents} /></div>
				{:else}
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
				{/if}
			</div>
		</div>
	</main>
</div>

<Sheet open={editOpen} title="Edit profile" close={() => (editOpen = false)}>
	{#snippet footer()}
		<button type="submit" form="profile-edit-form" class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md">
			Save changes
		</button>
	{/snippet}
	<form id="profile-edit-form" method="POST" action="?/updateProfile" enctype="multipart/form-data" use:enhance={handleProfileEnhance} class="flex flex-col gap-space-md">
		{#if editError}<p class="rounded-lg bg-error/10 border border-error/30 px-3 py-2 text-body-sm text-error" role="alert">{editError}</p>{/if}

		<section class="rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3">
			<h3 class="text-body-sm font-semibold text-on-surface mb-3">Profile photo</h3>
			<div class="flex items-center gap-3">
				<Avatar name={editName || name} src={avatarPhoto} imageStyle={avatarImageStyle} size="xl" />
				<label class="inline-flex items-center justify-center h-10 px-4 rounded-full border border-surface-glass-border text-body-sm font-medium text-on-surface hover:bg-surface-container-high cursor-pointer">
					Choose photo
					<input type="file" accept="image/*" class="sr-only" aria-label="Upload profile photo" onchange={(event) => handleImageUpload(event, 'avatar')} />
				</label>
			</div>
			<div class="grid grid-cols-2 gap-3 mt-3">
				<label class="text-xs text-on-surface-variant">Zoom / resize<input type="range" min="1" max="2" step="0.05" bind:value={profileAppearance.value.avatarZoom} class="block w-full mt-1 accent-primary" /></label>
				<label class="text-xs text-on-surface-variant">Vertical crop<input type="range" min="0" max="100" step="1" bind:value={profileAppearance.value.avatarCropY} class="block w-full mt-1 accent-primary" /></label>
			</div>
		</section>

		<section class="rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3">
			<h3 class="text-body-sm font-semibold text-on-surface mb-3">Profile banner</h3>
			<div class="relative h-24 rounded-lg overflow-hidden bg-gradient-to-r from-primary/50 via-[#312e81] to-surface-base">
				{#if bannerPhoto}<img src={bannerPhoto} alt="Banner crop preview" class="absolute inset-0 w-full h-full object-cover" style={bannerImageStyle} />{/if}
			</div>
			<label class="inline-flex items-center justify-center h-10 px-4 mt-3 rounded-full border border-surface-glass-border text-body-sm font-medium text-on-surface hover:bg-surface-container-high cursor-pointer">
				Choose banner
				<input type="file" accept="image/*" class="sr-only" aria-label="Upload profile banner" onchange={(event) => handleImageUpload(event, 'banner')} />
			</label>
			<div class="grid grid-cols-2 gap-3 mt-3">
				<label class="text-xs text-on-surface-variant">Zoom / resize<input type="range" min="1" max="2.5" step="0.05" bind:value={profileAppearance.value.bannerZoom} class="block w-full mt-1 accent-primary" /></label>
				<label class="text-xs text-on-surface-variant">Vertical crop<input type="range" min="0" max="100" step="1" bind:value={profileAppearance.value.bannerCropY} class="block w-full mt-1 accent-primary" /></label>
			</div>
		</section>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				Full name
				<input name="name" bind:value={editName} required minlength="2" maxlength="80" autocomplete="name" class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				Username
				<span class="relative flex items-center"><span class="absolute left-3 text-on-surface-variant">@</span><input name="username" bind:value={editUsername} readonly={usernameCooldownDays > 0} required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" autocomplete="username" class="w-full h-11 pl-8 pr-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline read-only:opacity-60" /></span>
				<span class="text-xs text-on-surface-variant">{#if usernameCooldownDays > 0}You can change this again in {usernameCooldownDays} days.{:else}Usernames can be changed once every 30 days.{/if}</span>
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant sm:col-span-2">
				Bio <span class="text-xs">{editBio.length}/200</span>
				<textarea name="bio" bind:value={editBio} rows="3" maxlength="200" class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				City
				<select name="city" bind:value={editCity} required autocomplete="address-level1" class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline">
					{#each NIGERIAN_STATES as state (state)}
						<option value={state}>{state} State</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				Link
				<input name="link" bind:value={editLink} type="text" inputmode="url" placeholder="https://your-site.com" class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
			</label>
		</div>

		<fieldset>
			<legend class="text-body-sm font-semibold text-on-surface mb-2">Interests</legend>
			<div class="flex flex-wrap gap-2">
				{#each interestChoices as interest (interest)}
					<label class="cursor-pointer">
						<input type="checkbox" name="interests" value={interest} checked={editInterests.includes(interest)} onchange={() => toggleInterest(interest)} class="sr-only" />
						<span class="block px-3 py-1.5 rounded-full border text-body-sm {editInterests.includes(interest) ? 'border-primary bg-primary/15 text-primary' : 'border-surface-glass-border bg-surface-container-high text-on-surface-variant'}">{interest}</span>
					</label>
				{/each}
			</div>
			<p class="text-xs text-on-surface-variant mt-2">Choose up to 12 interests to personalize event discovery.</p>
		</fieldset>
	</form>
</Sheet>

<Sheet open={followersOpen} title="Followers • 342" close={() => (followersOpen = false)}>
	<div class="flex flex-col gap-3 pt-2">
		<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5"><Users class="w-4 h-4" /> People following you</p>
		{#each followersProfiles as prof (prof.id)}
			<a href="/users/{prof.handle}" onclick={() => (followersOpen = false)} class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3 hover:bg-surface-container-high transition-colors">
				<Avatar name={prof.name} color={prof.avatarColor} size="md" />
				<span class="flex-1 min-w-0 text-left">
					<span class="block text-body-md font-semibold text-on-surface truncate flex items-center gap-1">{prof.name} {#if prof.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
					<span class="block text-body-sm text-on-surface-variant truncate">@{prof.handle} • {prof.city}</span>
				</span>
				<button type="button" class="text-label-badge px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold shrink-0" onclick={(e) => { e.preventDefault(); toggleIn(follows, prof.id); }}>{follows.value.includes(prof.id) ? 'Following' : 'Follow'}</button>
			</a>
		{/each}
	</div>
</Sheet>

<Sheet open={followingOpen} title="Following • {follows.value.length + 86}" close={() => (followingOpen = false)}>
	<div class="flex flex-col gap-3 pt-2">
		<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5"><Users class="w-4 h-4" /> People you follow</p>
		{#each followingProfiles as prof (prof.id)}
			<a href="/users/{prof.handle}" onclick={() => (followingOpen = false)} class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3 hover:bg-surface-container-high transition-colors">
				<Avatar name={prof.name} color={prof.avatarColor} size="md" />
				<span class="flex-1 min-w-0 text-left">
					<span class="block text-body-md font-semibold text-on-surface truncate flex items-center gap-1">{prof.name} {#if prof.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
					<span class="block text-body-sm text-on-surface-variant truncate">@{prof.handle} • {prof.city}</span>
				</span>
				<button type="button" class="text-label-badge px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold shrink-0" onclick={(e) => { e.preventDefault(); toggleIn(follows, prof.id); }}>{follows.value.includes(prof.id) ? 'Following' : 'Follow'}</button>
			</a>
		{/each}
		{#if followingProfiles.length === 0}
			<p class="text-body-sm text-on-surface-variant text-center py-6">You are not following anyone yet.</p>
		{/if}
	</div>
</Sheet>

<script lang="ts">
	import { BadgeCheck, Bell, Building2, Clock3, Globe, Hash, Mail, MapPin, MoreHorizontal, Search, Share2, ShieldCheck, UserPlus, UserCheck, Users, Mic, CalendarDays, Crown, AtSign, ArrowRight, Building, Shield } from '@lucide/svelte';

	import Avatar from '$components/Avatar.svelte';
	import Chip from '$components/Chip.svelte';
	import EventRow from '$components/EventRow.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { page } from '$app/state';
	import { follows, toggleIn } from '$lib/state/prefs.svelte';
	import { mockProfiles } from '$lib/data/mock-profiles';
	import { toast } from '$lib/state/toast.svelte';
	import type { EventItem } from '$lib/types';

	let { data } = $props();
	const profile = $derived(data.profile);
	const isDemoMode = $derived(Boolean((data as { demoMode?: boolean }).demoMode ?? page.data.demoMode));
	const following = $derived(follows.value.includes(profile.id));

	type ProfileCategory = 'all' | 'organized' | 'roles';
	let category = $state('all' as ProfileCategory);
	let followersOpen = $state(false);
	let followingOpen = $state(false);
	let followersProfiles = $derived(isDemoMode && profile.followers > 0 ? mockProfiles.slice().reverse() : []);
	let followingProfiles = $derived(isDemoMode && profile.following > 0 ? mockProfiles.slice(0, 4) : []);

	const organizedEvents = $derived(data.events.filter((event) => event.organizer?.id === profile.id));
	const roleEvents = $derived(
		data.events.filter((event) => {
			if (event.organizer?.id === profile.id) return false;
			return event.speakers.some(
				(speaker) =>
					speaker.id === profile.id &&
					!speaker.displayOnly &&
					(!speaker.invited || speaker.inviteStatus === 'accepted')
			);
		})
	);

	const filtered = $derived(
		category === 'organized' ? organizedEvents : category === 'roles' ? roleEvents : data.events
	);

	const heading = $derived(
		category === 'organized' ? 'Organized Events' : category === 'roles' ? 'Event Roles' : 'Events & sessions'
	);

	function speakerFor(event: EventItem) {
		return event.speakers.find(
			(speaker) => speaker.id === profile.id && (!speaker.invited || speaker.inviteStatus === 'accepted')
		);
	}

	const MONO = 'font-code text-[11px] tracking-[0.12em] uppercase';
	const NIGHT_MONO = 'font-code text-[10px] tracking-[0.16em] uppercase';
	let activeTab = $state('speaking' as 'speaking' | 'upcoming' | 'organized' | 'mutual');
	const now = new Date();
	const watTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT (UTC+1)';
	const upcoming = $derived(data.events.filter((e) => new Date(e.startsAt) > new Date()));
	const speakingCount = $derived(roleEvents.length);
	const upcomingCount = $derived(upcoming.length);
	const organizedCount = $derived(organizedEvents.length);
	const mutualCount = $derived(isDemoMode ? followersProfiles.length || 12 : 0);
	function fmtWAT(iso: string) {
		const d = new Date(iso);
		return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Lagos' }) + ' • ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT';
	}
	function fmtShort(iso: string) {
		const d = new Date(iso);
		return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT';
	}

</script>

<svelte:head><title>{profile.name} • Owltside</title></svelte:head>

<!-- ── Desktop console (md+) — mirrors app header + community profile ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-[#0A0A0C] text-white selection:bg-[#E8D9FF]/30">
	<header class="sticky top-0 z-50 h-[56px] border-b border-white/[0.06] bg-[#08080A]/90 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-full flex items-center gap-5">
			<a href="/home" class="flex items-center gap-3 shrink-0">
				<span class="font-display font-black tracking-tight text-white text-[18px]">OWLTSIDE</span>
				<span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-white/[0.08] border border-white/[0.06] font-code text-[10px] tracking-[0.14em] text-white/60">NIGHT PROTOCOL</span>
			</a>
			<nav class="flex items-center gap-1 ml-2" aria-label="Primary">
				<a href="/home" class="px-4 h-8 rounded-md flex items-center text-[13px] font-medium bg-white text-black">Home</a>
				<a href="/explore" class="px-4 h-8 rounded-md flex items-center text-[13px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">Explore</a>
				<a href="/tickets" class="px-4 h-8 rounded-md flex items-center text-[13px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">Tickets</a>
				<a href="/organizer" class="px-4 h-8 rounded-md flex items-center text-[13px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">Organizer</a>
			</nav>
			<div class="flex-1"></div>
			<label class="relative hidden lg:flex items-center w-[320px] h-9">
				<Search class="absolute left-3 w-4 h-4 text-white/30 pointer-events-none" />
				<input placeholder="Search dark events, venues, curations.." class="w-full h-full rounded-full bg-[#141416] border border-white/[0.08] pl-10 pr-16 text-[13px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/15" />
				<span class="absolute right-1.5 flex items-center gap-1 px-1.5 py-1 rounded bg-[#1E1E20] border border-white/[0.06] font-code text-[10px] text-white/50">⌘ K</span>
			</label>
			<a href="/notifications" aria-label="Notifications" class="relative w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0">
				<Bell class="w-5 h-5" />
				<span class="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-[#FF8A00] ring-2 ring-[#08080A]"></span>
			</a>
			<div class="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-white/[0.08] shrink-0">
				<div class="hidden xl:flex flex-col items-end leading-tight">
					<span class="text-[13px] font-semibold text-white leading-none">{page.data.session?.handle ? page.data.session.handle : 'Alex Rivera'}</span>
					<span class="flex items-center gap-1 font-code text-[10px] tracking-[0.14em] text-white/40"><span class="w-1.5 h-1.5 rounded-full bg-white/40"></span> Attendee</span>
				</div>
				<a href="/profile" aria-label="Your profile" class="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center">
					<Avatar name={page.data.session?.handle ?? profile.name} color={profile.avatarColor} size="sm" />
				</a>
			</div>
		</div>
	</header>

	<!-- hero -->
	<div class="bg-[#0F0F10] border-b border-white/[0.06]">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8">
			<div class="flex items-start justify-between gap-8">
				<div class="flex gap-5 min-w-0">
					<div class="w-24 h-24 rounded-xl overflow-hidden bg-[#1A1A1E] border border-white/10 shrink-0 relative">
						<!-- square avatar with initials or color -->
						<div class="w-full h-full flex items-center justify-center text-white font-display font-bold text-2xl" style="background: {profile.avatarColor ?? '#2A2A2E'}">
							{profile.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
						</div>
						<span class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#E9D5FF] border-2 border-[#0F0F10] flex items-center justify-center">
							<BadgeCheck class="w-4 h-4 text-[#7C3AED]" />
						</span>
					</div>
					<div class="min-w-0 pt-1">
						<div class="flex items-center gap-3 flex-wrap">
							<h1 class="font-display text-[26px] leading-none font-bold tracking-tight text-white">{profile.name}</h1>
							<span class="px-2 py-0.5 rounded bg-white/[0.08] border border-white/[0.06] font-code text-[11px] text-white/60">@{profile.handle}</span>
						</div>
						<div class="flex items-center gap-2 mt-2 flex-wrap">
							<span class="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/70">KEYNOTE SPEAKER</span>
							<span class="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/70">ORGANIZER</span>
							{#if profile.verified}
								<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/60"><span class="w-1.5 h-1.5 rounded-full bg-[#A78BFA]"></span> KYC TIER 3</span>
							{/if}
						</div>
						<p class="text-[13px] leading-5 text-white/60 mt-3 max-w-[640px]">{profile.bio ?? 'VP AI Research at SaharaTech. Exploring foundational Large Action Models and real-time inference at edge nodes. Keynote speaker at Pulse AI & Web Summit 2025.'}</p>
						<div class="flex items-center gap-3 mt-3 flex-wrap font-code text-[11px] tracking-[0.06em] text-white/40">
							<span class="inline-flex items-center gap-1.5"><MapPin class="w-3.5 h-3.5 text-white/30" /> {profile.city ?? 'Lagos & London'} // WAT Hub</span>
							<span class="w-px h-3 bg-white/10"></span>
							<span class="inline-flex items-center gap-1.5"><Clock3 class="w-3.5 h-3.5 text-white/30" /> {watTime}</span>
						</div>
					</div>
				</div>
				<div class="hidden lg:flex items-start gap-2 shrink-0">
					<button class="h-9 px-4 rounded-md flex items-center gap-2 bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.08] text-white text-[13px] font-medium transition-colors" onclick={() => { const added = toggleIn(follows, profile.id); toast(added ? `Following ${profile.name}` : 'Unfollowed', 'info'); }}>
						{#if following}<UserCheck class="w-4 h-4" /> Following{:else}<UserPlus class="w-4 h-4" /> Follow{/if}
					</button>
					<button class="h-9 px-5 rounded-md flex items-center gap-2 bg-[#E8E0FF] hover:bg-[#DDD6FE] text-[#1A1033] text-[13px] font-semibold transition-colors" onclick={() => toast('Message composer opened', 'info')}>
						<Mail class="w-4 h-4" /> Send Message
					</button>
					<button class="w-9 h-9 rounded-md flex items-center justify-center bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.08] text-white/70 hover:text-white transition-colors" aria-label="Share" onclick={() => toast('Link copied', 'success')}>
						<Share2 class="w-4 h-4" />
					</button>
					<button class="w-9 h-9 rounded-md flex items-center justify-center bg-[#1E1E20] hover:bg-[#252529] border border-white/[0.08] text-white/70 hover:text-white transition-colors" aria-label="More">
						<MoreHorizontal class="w-4 h-4" />
					</button>
				</div>
			</div>

			<!-- stats -->
			<div class="mt-8 grid grid-cols-4 gap-3">
				<div class="rounded-xl bg-[#151518] border border-white/[0.06] px-5 py-4">
					<div class="{NIGHT_MONO} text-white/40">NETWORK SESSIONS</div>
					<div class="mt-2 flex items-baseline gap-2">
						<span class="font-display text-xl font-bold text-white">{(organizedEvents.length + roleEvents.length) || data.events.length || 18}</span>
						<span class="text-[12px] text-white/50">Events Organized/Attended</span>
					</div>
				</div>
				<div class="rounded-xl bg-[#151518] border border-white/[0.06] px-5 py-4">
					<div class="{NIGHT_MONO} text-white/40">KEYNOTES & PANELS</div>
					<div class="mt-2 flex items-baseline gap-2">
						<span class="font-display text-xl font-bold text-white">{roleEvents.length || 8}</span>
						<span class="text-[12px] text-white/50">Speaking Delivered</span>
					</div>
				</div>
				<div class="rounded-xl bg-[#151518] border border-white/[0.06] px-5 py-4">
					<div class="{NIGHT_MONO} text-white/40">FOLLOWER GRAPH</div>
					<div class="mt-2 flex items-baseline gap-2">
						<span class="font-display text-xl font-bold text-white">{profile.followers.toLocaleString()}</span>
						<span class="text-[12px] text-white/50">Researchers & Devs</span>
					</div>
				</div>
				<div class="rounded-xl bg-[#151518] border border-white/[0.06] px-5 py-4">
					<div class="{NIGHT_MONO} text-white/40">ATTENDANCE RELIABILITY</div>
					<div class="mt-2 flex items-baseline gap-2">
						<span class="font-display text-xl font-bold text-white">99.8%</span>
						<span class="text-[12px] text-white/50">100% Check-in Record</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
		<!-- left -->
		<div class="flex flex-col gap-4 min-w-0">
			<!-- mutual banner -->
			{#if data.events.length}
				<div class="rounded-xl bg-[#151518] border border-white/[0.06] px-4 py-3 flex items-center gap-3">
					<span class="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.06] flex items-center justify-center shrink-0">
						<Users class="w-4 h-4 text-white/70" />
					</span>
					<div class="min-w-0 flex-1">
						<div class="text-[13px] font-medium text-white leading-none">You and {profile.name.split(' ')[0]} are both attending {data.events[0]?.title ?? 'Pulse AI & Web Summit 2025'}</div>
						<div class="text-[12px] text-white/50 mt-1">Identical schedule tier: Access to VIP Lounge & Founder Roundtables.</div>
					</div>
					<span class="hidden sm:inline-flex px-3 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/60 shrink-0">MUTUAL PASS</span>
				</div>
			{/if}

			<!-- tabs -->
			<div class="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 -mx-1 px-1">
				<button onclick={() => activeTab = 'speaking'} class="h-9 px-4 rounded-md flex items-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors {activeTab === 'speaking' ? 'bg-[#1E1E20] border border-white/[0.08] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'}">
					Speaking Sessions ({speakingCount})
				</button>
				<button onclick={() => activeTab = 'upcoming'} class="h-9 px-4 rounded-md flex items-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors {activeTab === 'upcoming' ? 'bg-[#1E1E20] border border-white/[0.08] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'}">
					Upcoming Events ({upcomingCount})
				</button>
				<button onclick={() => activeTab = 'organized'} class="h-9 px-4 rounded-md flex items-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors {activeTab === 'organized' ? 'bg-[#1E1E20] border border-white/[0.08] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'}">
					Organized Events ({organizedCount})
				</button>
				<button onclick={() => activeTab = 'mutual'} class="h-9 px-4 rounded-md flex items-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors {activeTab === 'mutual' ? 'bg-[#1E1E20] border border-white/[0.08] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'}">
					Mutual Connections ({mutualCount})
				</button>
			</div>

			<!-- speaking -->
			{#if activeTab === 'speaking'}
				<div class="flex flex-col gap-3">
					{#each roleEvents.slice(0, 3) as event, i (event.id)}
						{@const speaker = speakerFor(event)}
						<div class="rounded-xl bg-[#151518] border border-white/[0.06] overflow-hidden p-5">
							<div class="flex items-start justify-between gap-3">
								<span class="flex items-center gap-2">
									<span class="px-2.5 py-1 rounded bg-[#E8E0FF] text-[#1A1033] font-code text-[10px] tracking-[0.12em] font-semibold">
										{#if i === 0}KEYNOTE · HALL A{:else if i === 1}PANELIST{:else}FIRESIDE CHAT{/if}
									</span>
									<span class="{NIGHT_MONO} text-white/30">SESSION ID: {event.id.slice(0,3).toUpperCase()}-{100 + i * 212}</span>
								</span>
								<span class="inline-flex items-center gap-1.5 font-code text-[11px] text-white/40"><CalendarDays class="w-3.5 h-3.5" /> {fmtShort(event.startsAt)}</span>
							</div>
							<h3 class="font-display text-[18px] leading-tight font-semibold text-white mt-3">{event.title ?? 'Pulse AI & Web Summit 2025: Foundational Large Action Models in 2026'}</h3>
							<p class="text-[13px] leading-5 text-white/50 mt-2 line-clamp-2">{event.description ?? 'A technical exploration into continuous runtime architectures for Large Action Models operating over constrained local compute clusters in sub-Saharan edge facilities.'}</p>
							<div class="flex items-center justify-between gap-4 mt-4 flex-wrap">
								<span class="flex items-center gap-2 min-w-0">
									<span class="flex -space-x-1.5">
										<span class="w-7 h-7 rounded-full bg-[#2A2A2E] border border-[#151518] flex items-center justify-center text-[10px] text-white">TC</span>
										<span class="w-7 h-7 rounded-full bg-[#3A2A4A] border border-[#151518] flex items-center justify-center text-[10px] text-white">CV</span>
									</span>
									<span class="text-[12px] text-white/50 truncate">Co-speaking with {speaker?.role ? speaker.role : 'Dr. Tunde & Claire V.'}</span>
								</span>
								<span class="flex items-center gap-3 shrink-0">
									<span class="hidden sm:flex flex-col items-end leading-tight">
										<span class="{NIGHT_MONO} text-white/30">PASS TIER</span>
										<span class="text-[13px] font-semibold text-white">{event.tiers?.[0] ? `₦${event.tiers[0].price.toLocaleString()} NGN` : '₦65,000 NGN'}</span>
									</span>
									<a href="/events/{event.slug}" class="h-8 px-3 rounded-md bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors">View Event & Tickets <ArrowRight class="w-3.5 h-3.5" /></a>
								</span>
							</div>
							<div class="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06] font-code text-[11px] tracking-[0.04em] text-white/30">
								<span class="inline-flex items-center gap-1"><Building class="w-3 h-3" /> {event.venue ?? 'Landmark Centre, Victoria Island, Lagos'}</span>
								<span class="w-1 h-1 rounded-full bg-white/20"></span>
								<span>Audience Capacity: {(event.attendees ?? 1200).toLocaleString()}</span>
							</div>
						</div>
					{:else}
						<p class="text-[13px] text-white/50 bg-[#151518] border border-white/[0.06] rounded-xl p-6 text-center">No speaking sessions yet — when {profile.name} accepts a speaker invitation, it appears here.</p>
					{/each}
					<!-- extra static cards to match screenshot if less than 3 -->
					{#if roleEvents.length === 0}
						<div class="rounded-xl bg-[#151518] border border-white/[0.06] p-5">
							<div class="flex items-center justify-between"><span class="px-2.5 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/60">PANELIST</span><span class="font-code text-[11px] text-white/40 flex items-center gap-1.5"><CalendarDays class="w-3.5 h-3.5" /> Dec 14, 2026 • 14:00 WAT</span></div>
							<h3 class="font-display text-[18px] font-semibold text-white mt-3">Autonomous Agents & Distributed Systems 2026</h3>
							<p class="text-[13px] text-white/50 mt-2">Panel discussion covering safety parameters, fault-tolerant orchestration, and state isolation in multi-agent real-time pipelines.</p>
							<div class="flex items-center justify-between mt-4"><span class="inline-flex items-center gap-1.5 text-[12px] text-white/40"><MapPin class="w-3.5 h-3.5" /> Eko Atlantic Convention Center, Lagos</span><span class="h-8 px-3 rounded-md bg-white/[0.06] border border-white/[0.06] text-white text-[12px] font-medium inline-flex items-center">Session Details</span></div>
						</div>
						<div class="rounded-xl bg-[#151518] border border-white/[0.06] p-5">
							<div class="flex items-center justify-between"><span class="px-2.5 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/60">FIRESIDE CHAT</span><span class="font-code text-[11px] text-white/40 flex items-center gap-1.5"><CalendarDays class="w-3.5 h-3.5" /> Jan 28, 2026 • 17:15 WAT</span></div>
							<h3 class="font-display text-[18px] font-semibold text-white mt-3">Lagos Tech Tribe Summit: Scaling Real-Time Inference</h3>
							<p class="text-[13px] text-white/50 mt-2">An informal conversation on engineering bottlenecks when deploying sub-50ms inference engines for localized African dialect voice synthesis.</p>
							<div class="flex items-center justify-between mt-4"><span class="inline-flex items-center gap-1.5 text-[12px] text-white/40"><MapPin class="w-3.5 h-3.5" /> TechZone Hive, Yaba, Lagos</span><span class="h-8 px-3 rounded-md bg-white/[0.06] border border-white/[0.06] text-white text-[12px] font-medium inline-flex items-center">Session Details</span></div>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'upcoming'}
				<div class="flex flex-col gap-3">
					{#each upcoming.slice(0, 6) as event (event.id)}
						<div class="rounded-xl bg-[#151518] border border-white/[0.06] p-5">
							<div class="flex items-center justify-between"><span class="{NIGHT_MONO} text-white/30">UPCOMING • {event.venue}</span><span class="font-code text-[11px] text-white/40">{fmtShort(event.startsAt)}</span></div>
							<h3 class="font-display text-[16px] font-semibold text-white mt-2">{event.title}</h3>
							<a href="/events/{event.slug}" class="mt-3 inline-flex h-8 px-3 rounded-md bg-white/[0.06] border border-white/[0.06] text-white text-[12px] font-medium items-center gap-1.5">View Event <ArrowRight class="w-3.5 h-3.5" /></a>
						</div>
					{:else}
						<p class="text-[13px] text-white/50 bg-[#151518] border border-white/[0.06] rounded-xl p-6 text-center">No upcoming events.</p>
					{/each}
				</div>
			{:else if activeTab === 'organized'}
				<div class="flex flex-col gap-3">
					{#each organizedEvents.slice(0, 6) as event (event.id)}
						<div class="rounded-xl bg-[#151518] border border-white/[0.06] p-5">
							<div class="flex items-center justify-between"><span class="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[10px] tracking-[0.12em] text-white/60">ORGANIZED</span><span class="font-code text-[11px] text-white/40">{fmtShort(event.startsAt)}</span></div>
							<h3 class="font-display text-[16px] font-semibold text-white mt-2">{event.title}</h3>
							<p class="text-[13px] text-white/50 mt-1 line-clamp-2">{event.description}</p>
							<a href="/events/{event.slug}" class="mt-3 inline-flex h-8 px-3 rounded-md bg-white/[0.06] border border-white/[0.06] text-white text-[12px] font-medium items-center gap-1.5">View Event & Tickets <ArrowRight class="w-3.5 h-3.5" /></a>
						</div>
					{:else}
						<p class="text-[13px] text-white/50 bg-[#151518] border border-white/[0.06] rounded-xl p-6 text-center">No organized events yet.</p>
					{/each}
				</div>
			{:else}
				<div class="rounded-xl bg-[#151518] border border-white/[0.06] p-6">
					<div class="{NIGHT_MONO} text-white/40">MUTUAL CONNECTIONS • {mutualCount}</div>
					<div class="grid sm:grid-cols-2 gap-3 mt-4">
						{#each followersProfiles.slice(0, 6) as prof (prof.id)}
							<a href="/users/{prof.handle}" class="flex items-center gap-3 rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 hover:bg-white/[0.06] transition-colors">
								<Avatar name={prof.name} color={prof.avatarColor} size="md" />
								<span class="min-w-0 flex-1">
									<span class="block text-[13px] font-semibold text-white truncate">{prof.name}</span>
									<span class="block text-[12px] text-white/40 truncate">@{prof.handle} • {prof.city}</span>
								</span>
							</a>
						{:else}
							<p class="text-[13px] text-white/50 col-span-2">No mutual connections yet.</p>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- right sidebar -->
		<div class="flex flex-col gap-4 shrink-0">
			<section class="rounded-xl bg-[#151518] border border-white/[0.06] p-4">
				<div class="flex items-center justify-between">
					<h2 class="{NIGHT_MONO} text-white/40">IDENTITY ATTESTATIONS</h2>
					<ShieldCheck class="w-4 h-4 text-white/20" />
				</div>
				<div class="flex flex-col gap-3 mt-4">
					<div class="rounded-lg bg-[#0A0A0C] border border-white/[0.04] p-3 flex gap-3">
						<Building2 class="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
						<div class="min-w-0 flex-1">
							<div class="text-[13px] font-semibold text-white leading-none">SaharaTech Research Labs</div>
							<div class="text-[11px] text-white/40 mt-1">Vice President, AI Research</div>
							<div class="mt-2 inline-flex items-center gap-1 font-code text-[10px] tracking-[0.10em] text-[#A78BFA]"><span class="w-1 h-1 rounded-full bg-[#A78BFA]"></span> Institutional Domain Verified</div>
						</div>
					</div>
					<div class="rounded-lg bg-[#0A0A0C] border border-white/[0.04] p-3 flex gap-3">
						<Shield class="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
						<div class="min-w-0 flex-1">
							<div class="text-[13px] font-semibold text-white leading-none">Government Identity Attestation</div>
							<div class="text-[11px] text-white/40 mt-1">National Identity Registry (NIN)</div>
							<div class="mt-2 font-code text-[10px] tracking-[0.10em] text-white/30">KYC Tier 3 Confirmed</div>
						</div>
					</div>
					<div class="rounded-lg bg-[#0A0A0C] border border-white/[0.04] p-3 flex gap-3">
						<AtSign class="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
						<div class="min-w-0 flex-1">
							<div class="text-[13px] font-semibold text-white leading-none">X / Twitter</div>
							<div class="text-[11px] text-white/40 mt-1">@{profile.handle} (Official Profile)</div>
							<div class="mt-2 font-code text-[10px] tracking-[0.10em] text-white/30">Cryptographic Handshake Valid</div>
						</div>
					</div>
				</div>
			</section>

			<section class="rounded-xl bg-[#151518] border border-white/[0.06] p-4">
				<h2 class="{NIGHT_MONO} text-white/40">EXPERTISE & DOMAINS</h2>
				<div class="flex flex-wrap gap-1.5 mt-3">
					{#each (['#ArtificialIntelligence','#LargeActionModels','#AutonomousAgents','#EdgeComputing','#NeuralArchitecture','#SubSaharanLatency']) as tag}
						<span class="px-2.5 py-1 rounded bg-white/[0.06] border border-white/[0.06] font-code text-[11px] text-white/60">{tag}</span>
					{/each}
				</div>
			</section>

			<section class="rounded-xl bg-[#151518] border border-white/[0.06] p-4">
				<div class="flex items-center justify-between">
					<h2 class="{NIGHT_MONO} text-white/40">CO-SPEAKERS NETWORK</h2>
					<span class="font-code text-[10px] tracking-[0.12em] text-white/30">12 Shared</span>
				</div>
				<div class="flex flex-col gap-3 mt-4">
					{#each (isDemoMode ? mockProfiles.slice(0,3) : [{name:'Chinelo Okeke', handle:'chinelo', city:'Lagos', avatarColor:'#7C3AED'}, {name:'Tunde Bakare', handle:'tunde', city:'Lagos', avatarColor:'#0EA5E9'}, {name:'Alex Rivera', handle:'alex', city:'Attendee', avatarColor:'#F97316'}]) as person, idx}
						<div class="flex items-center gap-3">
							<Avatar name={person.name} color={person.avatarColor} size="md" />
							<span class="min-w-0 flex-1">
								<span class="block text-[13px] font-semibold text-white leading-none">{person.name}</span>
								<span class="block text-[11px] text-white/40 mt-1">{idx === 0 ? 'Lead Arch @ PayFlow' : idx === 1 ? 'Fellow @ LagosAI' : 'Core Protocol Attendee'}</span>
							</span>
							<span class="font-code text-[11px] text-white/30">{4 - idx} Events</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl bg-[#151518] border border-white/[0.06] p-4">
				<h2 class="flex items-center gap-1.5 {NIGHT_MONO} text-white/40"><span class="w-1.5 h-1.5 rounded-full bg-white/60"></span> DIRECT COMMS PROTOCOL</h2>
				<p class="text-[12px] leading-4 text-white/50 mt-3">Encrypted direct channel active. Average verified response time: <span class="text-white font-semibold">&lt; 2 hours</span>.</p>
				<textarea placeholder="State purpose of inquiry or session invite..." rows="2" class="mt-3 w-full rounded-lg bg-[#0A0A0C] border border-white/[0.06] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/15 resize-none"></textarea>
				<button class="mt-3 w-full h-9 rounded-md bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] text-white text-[13px] font-medium flex items-center justify-center gap-2 transition-colors" onclick={() => toast('Prompt transmitted', 'success')}>
					<span class="text-[12px]">▷</span> Transmit Prompt
				</button>
			</section>
		</div>
	</div>

	<footer class="mt-auto border-t border-white/[0.06] bg-[#08080A]">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-black text-white tracking-tight text-[13px]">OWLTSIDE</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-white/30">EVENT PROTOCOL 2.4.0</span>
				<span class="font-code text-[11px] text-white/30">© 2025 OWLTSIDE Inc. All rights reserved.</span>
			</span>
			<span class="flex items-center gap-5 font-code text-[10px] tracking-[0.14em] text-white/30">
				<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#22C55E]"></span> ALL NODES OPERATIONAL</span>
				<a href="/legal" class="hover:text-white/60">Privacy</a>
				<a href="/legal" class="hover:text-white/60">Terms</a>
				<a href="/legal" class="hover:text-white/60">Registry</a>
			</span>
		</div>
	</footer>
</div>


<!-- ── Mobile (unchanged layout, now md:hidden) ── -->
<div class="md:hidden flex flex-col min-h-dvh bg-surface">
<TopBar back title={`@${profile.handle}`} subtitle="Community profile" />

<main class="flex flex-col relative w-full pt-mobile-header pb-28 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-3xl md:mx-auto">
		<div class="relative w-full h-36 overflow-hidden">
			<div class="w-full h-full" style="background: linear-gradient(140deg, {profile.avatarColor}33 0%, #0b1326 80%), linear-gradient(#131b2e, #0b1120);"></div>
			<div class="absolute inset-0 bg-gradient-to-b from-transparent to-surface"></div>
		</div>
		<div class="px-gutter -mt-10 relative z-10 flex flex-col gap-space-md">
			<div class="flex items-end justify-between">
				<div class="relative">
					<div class="w-20 h-20 rounded-full p-0.5 bg-surface">
						<Avatar name={profile.name} color={profile.avatarColor} size="xl" />
					</div>
				</div>
				<button
					class="h-11 px-5 rounded-full flex items-center gap-2 text-body-sm font-semibold active:scale-95 transition-all shadow-md
						{following ? 'bg-surface-container-high text-on-surface' : 'bg-primary text-on-primary glow-primary'}"
					onclick={() => {
						const added = toggleIn(follows, profile.id);
						toast(added ? `Following ${profile.name}` : 'Unfollowed', 'info');
					}}
				>
					{#if following}<UserCheck class="w-4 h-4" /> Following{:else}<UserPlus class="w-4 h-4" /> Follow{/if}
				</button>
			</div>

			<div>
				<h1 class="font-display text-headline-lg-mobile text-on-surface tracking-tight flex items-center gap-2">
					{profile.name}
					{#if profile.verified}<BadgeCheck class="w-5 h-5 text-tertiary shrink-0" aria-label="Verified member" />{/if}
				</h1>
				<p class="font-code text-label-code text-outline mt-0.5">@{profile.handle} • {profile.city ?? 'Somewhere loud'}</p>
				{#if profile.bio}<p class="text-body-md text-on-surface-variant mt-2">{profile.bio}</p>{/if}
				{#if profile.link}
					<span class="inline-flex items-center gap-1 text-label-badge text-tertiary mt-2"><Globe class="w-3.5 h-3.5" />{profile.link.replace('https://', '')}</span>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-2 bg-surface-container-low rounded-xl p-3 shadow-md">
				<button type="button" onclick={() => (followersOpen = true)} class="flex flex-col items-center rounded-lg hover:bg-surface-container transition-colors py-1 active:scale-[0.98]">
					<span class="font-display text-headline-md text-primary font-semibold">{profile.followers.toLocaleString()}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Followers</span>
				</button>
				<button type="button" onclick={() => (followingOpen = true)} class="flex flex-col items-center rounded-lg hover:bg-surface-container transition-colors py-1 active:scale-[0.98]">
					<span class="font-display text-headline-md text-on-surface font-semibold">{profile.following.toLocaleString()}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Following</span>
				</button>
			</div>

			{#if data.events.length}
				<div class="flex flex-col gap-space-xs">
					<div class="flex items-center justify-between">
						<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{heading}</span>
						<span class="text-label-badge text-outline-variant">{filtered.length} total</span>
					</div>
					<div class="flex gap-2 overflow-x-auto pb-1 -mx-gutter px-gutter scrollbar-none">
						<Chip label={`All · ${data.events.length}`} icon={CalendarDays} active={category === 'all'} onclick={() => (category = 'all')} />
						<Chip label={`Organized · ${organizedEvents.length}`} icon={Crown} active={category === 'organized'} onclick={() => (category = 'organized')} />
						<Chip label={`Event Roles · ${roleEvents.length}`} icon={Mic} active={category === 'roles'} onclick={() => (category = 'roles')} />
					</div>
				</div>

				{#if category === 'all'}
					{#if organizedEvents.length}
						<div class="flex flex-col gap-space-xs pb-2">
							<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Organized</span>
							{#each organizedEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
							{/each}
						</div>
					{/if}
					<div class="flex flex-col gap-space-xs pb-6">
						<span class="flex items-center gap-1.5 text-label-badge text-on-surface-variant uppercase tracking-wider">
							<Mic class="w-3.5 h-3.5" /> Event Roles {#if roleEvents.length}<span class="text-outline-variant normal-case tracking-normal">· {roleEvents.length} accepted</span>{/if}
						</span>
						{#if roleEvents.length}
							{#each roleEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Speaker'} />
							{/each}
						{:else}
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
								No accepted event roles yet - when {profile.name} accepts a speaker invitation, the role will appear here for anyone viewing this profile.
							</p>
						{/if}
					</div>
				{:else if category === 'organized'}
					<div class="flex flex-col gap-space-xs pb-6">
						{#if organizedEvents.length}
							{#each organizedEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
							{/each}
						{:else}
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">No organized events yet.</p>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col gap-space-xs pb-6">
						{#if roleEvents.length}
							{#each roleEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Speaker'} />
							{/each}
						{:else}
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
								No accepted event roles yet - when {profile.name} accepts a speaker invitation, the role will appear here for anyone viewing this profile.
							</p>
						{/if}
					</div>
				{/if}
			{:else}
				<div class="flex flex-col gap-space-xs pb-6">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Events & sessions</span>
					<p class="text-body-sm text-on-surface-variant">No events yet.</p>
					<div class="flex gap-2 overflow-x-auto pb-1 -mx-gutter px-gutter scrollbar-none">
						<Chip label="All · 0" icon={CalendarDays} active={category === 'all'} onclick={() => (category = 'all')} />
						<Chip label="Event Roles · 0" icon={Mic} active={category === 'roles'} onclick={() => (category = 'roles')} />
					</div>
					<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
						No accepted event roles yet - when this member accepts a speaker invitation, the role will appear here for anyone viewing this profile.
					</p>
				</div>
			{/if}
		</div>
	</div>
</main>
</div>

<Sheet open={followersOpen} title="Followers • {profile.followers.toLocaleString()}" close={() => (followersOpen = false)}>
	<div class="flex flex-col gap-3 pt-2">
		<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5"><Users class="w-4 h-4" /> People following {profile.name}</p>
		{#each followersProfiles as prof (prof.id)}
			<a href="/users/{prof.handle}" onclick={() => (followersOpen = false)} class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3 hover:bg-surface-container-high transition-colors">
				<Avatar name={prof.name} color={prof.avatarColor} size="md" />
				<span class="flex-1 min-w-0">
					<span class="block text-body-md font-semibold text-on-surface truncate flex items-center gap-1">{prof.name} {#if prof.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
					<span class="block text-body-sm text-on-surface-variant truncate">@{prof.handle} • {prof.city}</span>
				</span>
				<button type="button" class="text-label-badge px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold shrink-0" onclick={(e) => { e.preventDefault(); toggleIn(follows, prof.id); }}>{follows.value.includes(prof.id) ? 'Following' : 'Follow'}</button>
			</a>
		{/each}
		{#if followersProfiles.length === 0}
			<p class="text-body-sm text-on-surface-variant text-center py-6">No followers yet.</p>
		{/if}
	</div>
</Sheet>

<Sheet open={followingOpen} title="Following • {profile.following.toLocaleString()}" close={() => (followingOpen = false)}>
	<div class="flex flex-col gap-3 pt-2">
		<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5"><Users class="w-4 h-4" /> People followed by {profile.name}</p>
		{#each followingProfiles as prof (prof.id)}
			<a href="/users/{prof.handle}" onclick={() => (followingOpen = false)} class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3 hover:bg-surface-container-high transition-colors">
				<Avatar name={prof.name} color={prof.avatarColor} size="md" />
				<span class="flex-1 min-w-0">
					<span class="block text-body-md font-semibold text-on-surface truncate flex items-center gap-1">{prof.name} {#if prof.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
					<span class="block text-body-sm text-on-surface-variant truncate">@{prof.handle} • {prof.city}</span>
				</span>
				<button type="button" class="text-label-badge px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold shrink-0" onclick={(e) => { e.preventDefault(); toggleIn(follows, prof.id); }}>{follows.value.includes(prof.id) ? 'Following' : 'Follow'}</button>
			</a>
		{/each}
		{#if followingProfiles.length === 0}
			<p class="text-body-sm text-on-surface-variant text-center py-6">Not following anyone yet.</p>
		{/if}
	</div>
</Sheet>


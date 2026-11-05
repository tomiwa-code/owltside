<script lang="ts">
	import {
		ArrowUpRight,
		Bell,
		CalendarDays,
		ClipboardCheck,
		Flag,
		Megaphone,
		Receipt,
		RefreshCw,
		RotateCcw,
		Search,
		Send,
		Users,
		Wallet
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$components/PageHeader.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import Sheet from '$components/Sheet.svelte';
	import { toasts } from '$admin/state/toast.svelte';
	import { dateTime, num, relative } from '$admin/utils/format';
	import type { AdminAnnouncement, AdminNotificationItem } from '$admin/types';

	let { data } = $props();

	let filter = $state<'all' | 'actionable' | 'verification' | 'payout' | 'refund' | 'report' | 'event' | 'order'>('all');
	let query = $state('');
	let refreshing = $state(false);
	let announcementOpen = $state(false);
	let announcementTitle = $state('');
	let announcementBody = $state('');
	let sendingAnnouncement = $state(false);

	const items = $derived<AdminNotificationItem[]>(data.bundle.items);
	const counts = $derived(data.bundle.counts);

	const filtered = $derived(
		items
			.filter((item) => {
				if (filter === 'all') return true;
				if (filter === 'actionable') return item.actionable;
				return item.kind === filter;
			})
			.filter((item) => {
				const q = query.trim().toLowerCase();
				if (!q) return true;
				return `${item.title} ${item.body} ${item.actor} ${item.kind} ${item.status}`
					.toLowerCase()
					.includes(q);
			})
	);

	async function reload() {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	}

	function closeAnnouncement() {
		if (!sendingAnnouncement) announcementOpen = false;
	}

	async function sendAnnouncement() {
		if (sendingAnnouncement || !announcementTitle.trim() || !announcementBody.trim()) return;
		sendingAnnouncement = true;
		try {
			const response = await fetch('/api/announcements', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: announcementTitle, body: announcementBody })
			});
			const payload = (await response.json().catch(() => ({}))) as {
				message?: string;
				announcement?: AdminAnnouncement;
			};
			if (!response.ok || !payload.announcement) {
				toasts.error('Announcement not sent', payload.message ?? 'The public app could not be reached.');
				return;
			}

			const sent = payload.announcement;
			announcementOpen = false;
			announcementTitle = '';
			announcementBody = '';
			toasts.ok(
				'Announcement sent to all users',
				`Delivered to ${num(sent.recipientCount)} public app user${sent.recipientCount === 1 ? '' : 's'} with the social footer attached.`
			);
			await invalidateAll().catch(() => undefined);
		} catch (cause) {
			toasts.error('Announcement not sent', cause instanceof Error ? cause.message : 'Try again.');
		} finally {
			sendingAnnouncement = false;
		}
	}

	function badgeTone(item: AdminNotificationItem): string {
		if (item.status === 'reverification_required') return 'chip chip-warn';
		if (!item.actionable) return 'chip chip-ok';
		if (item.kind === 'report') return 'chip chip-danger';
		if (item.kind === 'refund' || item.kind === 'payout') return 'chip chip-warn';
		return 'chip chip-accent';
	}
</script>

<svelte:head><title>Notifications & Request Feed · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Notifications & Submitted Requests"
		subtitle="Review requests from the public app, or send a platform announcement to every user’s notification hub."
		crumbs={['overview', 'notifications']}
		eyebrow={`${counts.actionable} awaiting review`}
	>
		{#snippet actions()}
			<button type="button" class="btn btn-sm" disabled={refreshing} onclick={reload}>
				<RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} /> Refresh feed
			</button>
			<a href="/approvals" class="btn btn-sm">
				<ClipboardCheck size={12} /> Open Approvals Queue
			</a>
			<button
				type="button"
				class="btn btn-sm btn-primary"
				disabled={!data.canAnnounce}
				title={data.canAnnounce ? 'Compose an announcement for every public app user' : 'Read-only auditors cannot send announcements'}
				onclick={() => (announcementOpen = true)}
			>
				<Megaphone size={12} /> Send announcement
			</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
		<div class="panel p-4">
			<p class="mono-label">Action required</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none {counts.actionable > 0 ? 'text-amber-200' : 'text-emerald-300'}">{num(counts.actionable)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Pending admin review</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">KYC & Payouts</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.verifications + counts.payouts)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{counts.verifications} KYC/bank · {counts.payouts} payouts</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Refund requests</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.refunds)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Ticket return requests</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Content reports</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.reports)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Flagged events & profiles</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Event submissions</p>
			<p class="mt-2 font-display text-[clamp(18px,2.4vw,24px)] font-semibold leading-none text-[#f1f1f6]">{num(counts.events)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Moderation & status changes</p>
		</div>
	</div>

	<section class="panel overflow-hidden" aria-labelledby="sent-announcements-title">
		<header class="flex flex-wrap items-center justify-between gap-2 border-b border-[#25252d] px-4 py-3">
			<div class="flex items-center gap-2.5">
				<span class="flex h-8 w-8 items-center justify-center rounded-lg border border-[#34343d] bg-[#1e1e25] text-[#c6bcff]"><Megaphone size={14} /></span>
				<div>
					<h2 id="sent-announcements-title" class="font-display text-[14px] font-semibold text-[#f0f0f5]">Sent announcements</h2>
					<p class="text-[10px] text-[#6f6f7b]">Recent platform-wide deliveries to the public app.</p>
				</div>
			</div>
			<span class="chip chip-accent"><Users size={10} /> All users</span>
		</header>
		{#if data.announcements.length}
			<div class="divide-y divide-[#23232b]">
				{#each data.announcements as announcement (announcement.id)}
					<article class="px-4 py-3.5">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-[13px] font-medium text-[#ededf4]">Announcement · {announcement.title}</h3>
							<span class="font-code text-[9px] text-[#7f7f8c]">{relative(announcement.sentAt)} · {dateTime(announcement.sentAt)}</span>
						</div>
						<p class="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[#9b9ba8]">{announcement.body}</p>
						<p class="mt-2 font-code text-[9px] uppercase tracking-[0.06em] text-[#787886]">
							{num(announcement.recipientCount)} recipient{announcement.recipientCount === 1 ? '' : 's'} · Sent by {announcement.sentBy} · Social footer included
						</p>
					</article>
				{/each}
			</div>
		{:else}
			<p class="px-4 py-5 text-[12px] text-[#8f8f9b]">No platform announcements have been sent yet.</p>
		{/if}
	</section>

	<div class="panel overflow-hidden">
		<div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#25252d] px-3.5 py-2.5">
			<div class="flex flex-wrap items-center gap-1">
				{#each [
					['all', `All (${counts.all})`],
					['actionable', `Pending (${counts.actionable})`],
					['verification', `KYC & Bank (${counts.verifications})`],
					['payout', `Payouts (${counts.payouts})`],
					['refund', `Refunds (${counts.refunds})`],
					['report', `Reports (${counts.reports})`],
					['event', `Events (${counts.events})`],
					['order', `Orders (${counts.orders})`]
				] as [key, label]}
					<button
						type="button"
						onclick={() => (filter = key as typeof filter)}
						class="rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors {filter === key
							? 'bg-[#7c60f6]/18 text-[#e4deff] ring-1 ring-[#7c60f6]/40'
							: 'text-[#8c8c99] hover:text-[#d0d0da]'}"
					>
						{label}
					</button>
				{/each}
			</div>

			<div class="relative w-full sm:w-64">
				<Search size={13} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e6e7a]" />
				<input
					class="input input-sm pl-8"
					placeholder="Filter by requester, event, code…"
					bind:value={query}
				/>
			</div>
		</div>

		{#if filtered.length === 0}
			<EmptyState
				title="No matching notifications"
				message="Submitted approvals, KYC documents, bank verifications, payouts, refunds, reports, and events will appear here."
			/>
		{:else}
			<div class="divide-y divide-[#23232b]">
				{#each filtered as item (item.id)}
					<a
						href={item.href}
						class="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-[#1a1a22] sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex min-w-0 items-start gap-3">
							<span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2f2f39] bg-[#16161d] text-[#c6bcff]">
								{#if item.kind === 'refund'}
									<RotateCcw size={14} />
								{:else if item.kind === 'payout'}
									<Wallet size={14} />
								{:else if item.kind === 'report'}
									<Flag size={14} />
								{:else if item.kind === 'event'}
									<CalendarDays size={14} />
								{:else if item.kind === 'order'}
									<Receipt size={14} />
								{:else}
									<ClipboardCheck size={14} />
								{/if}
							</span>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class={badgeTone(item)}>{item.kind} · {item.status === 'reverification_required' ? 'Awaiting user' : item.status}</span>
									<span class="font-code text-[9.5px] text-[#7f7f8c]">
										{relative(item.createdAt)} · {dateTime(item.createdAt)}
									</span>
								</div>
								<p class="mt-1 text-[13px] font-medium text-[#ededf4]">{item.title}</p>
								<p class="mt-0.5 text-[12px] text-[#9b9ba8]">{item.body}</p>
								<p class="mt-1 font-code text-[10px] text-[#787886]">Submitted by: {item.actor}</p>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2 self-end sm:self-center">
							<span class="btn btn-xs {item.actionable ? 'btn-primary' : ''}">
								{item.actionable ? 'Review now' : 'Open'} <ArrowUpRight size={11} />
							</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

<Sheet
	open={announcementOpen}
	title="Send announcement"
	subtitle="Deliver immediately to every public app user’s notification hub."
	onclose={closeAnnouncement}
	width="560px"
>
	<form id="platform-announcement-form" onsubmit={(event) => { event.preventDefault(); void sendAnnouncement(); }} class="space-y-4">
		<div class="flex items-center gap-3 rounded-lg border border-[#7c60f6]/25 bg-[#7c60f6]/8 px-3 py-2.5">
			<Users size={16} class="shrink-0 text-[#c6bcff]" />
			<div>
				<p class="text-[12px] font-medium text-[#e4deff]">Audience: all users</p>
				<p class="text-[10.5px] text-[#9b9ba8]">Every public profile receives an unread announcement.</p>
			</div>
		</div>

		<label class="block">
			<span class="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#c9c9d4]">
				<span>Title</span><span class="font-code text-[9px] text-[#6f6f7b]">{announcementTitle.length}/100</span>
			</span>
			<input
				class="input"
				value={announcementTitle}
				oninput={(event) => (announcementTitle = event.currentTarget.value)}
				maxlength="100"
				required
				disabled={sendingAnnouncement}
				placeholder="A new chapter for Owltside"
				aria-label="Announcement title"
			/>
		</label>

		<label class="block">
			<span class="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#c9c9d4]">
				<span>Message</span><span class="font-code text-[9px] text-[#6f6f7b]">{announcementBody.length}/2000</span>
			</span>
			<textarea
				class="input min-h-32 resize-y py-2.5"
				value={announcementBody}
				oninput={(event) => (announcementBody = event.currentTarget.value)}
				maxlength="2000"
				required
				disabled={sendingAnnouncement}
				placeholder="Share the update your community should know about…"
				aria-label="Announcement message"
			></textarea>
		</label>

		<section class="rounded-xl border border-[#2c2c35] bg-[#15151a] p-4" aria-label="Announcement preview">
			<p class="mono-label !text-[8px]">Public app preview</p>
			<div class="mt-3 flex items-start gap-3">
				<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#34343d] bg-[#1e1e25] text-[#c6bcff]"><Megaphone size={15} /></span>
				<div class="min-w-0">
					<h3 class="text-[13px] font-semibold text-[#ededf4]">Announcement · {announcementTitle.trim() || 'Your title'}</h3>
					<p class="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[#9b9ba8]">{announcementBody.trim() || 'Your announcement message will appear here.'}</p>
				</div>
			</div>
			<div class="mt-4 border-t border-[#2c2c35] pt-3 text-[10px] text-[#8f8f9b]">
				<span class="font-medium text-[#c9c9d4]">Follow for updates</span> and the Instagram, X and TikTok icons are automatically placed at the end.
			</div>
		</section>
	</form>

	{#snippet footer()}
		<div class="flex items-center justify-end gap-2">
			<button type="button" class="btn btn-sm" disabled={sendingAnnouncement} onclick={closeAnnouncement}>Cancel</button>
			<button
				type="submit"
				form="platform-announcement-form"
				class="btn btn-sm btn-primary"
				disabled={sendingAnnouncement || !announcementTitle.trim() || !announcementBody.trim()}
			>
				<Send size={12} class={sendingAnnouncement ? 'animate-pulse' : ''} />
				{sendingAnnouncement ? 'Sending…' : 'Send to all users'}
			</button>
		</div>
	{/snippet}
</Sheet>

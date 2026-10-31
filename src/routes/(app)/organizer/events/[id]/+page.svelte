<script lang="ts">
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import {
		ArrowLeft,
		Download,
		Edit,
		Trash2,
		UserCheck,
		Megaphone,
		ScanBarcode,
		Info,
		Receipt,
		Users,
		Wallet
	} from '@lucide/svelte';
	import Sheet from '$components/Sheet.svelte';
	import EventStatusBadge from '$components/EventStatusBadge.svelte';
	import PayoutRequestButton from '$components/PayoutRequestButton.svelte';
	import ApprovalNotice from '$components/ApprovalNotice.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { appSettings } from '$lib/state/settings.svelte';
	import { useQuery } from '$lib/state/query.svelte';
	import { subscribeTable } from '$lib/realtime';
	import { payoutAccountLabel } from '$lib/utils/payout';
	import { formatMoney } from '$lib/utils/money';
	import { fmtDateTime, fmtRelative } from '$lib/utils/dates';
	import { downloadCsv, ticketsToCsv } from '$lib/utils/csv';
	import { isEventClosed, resolveEventPayoutRequest } from '$lib/utils/event-status';
	import { toast } from '$lib/state/toast.svelte';
	import type { ApprovalRequest } from '$lib/types';
	import type { Snippet } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: Omit<PageData, 'approvals'> & { approvals?: ApprovalRequest[] } } = $props();

	let tab = $state<'attendees' | 'orders' | 'log'>('attendees');
	let broadcastOpen = $state(false);
	let editOpen = $state(false);
	let msg = $state('');
	let editTitle = $state('');
	let editVenue = $state('');
	let editCity = $state('');
	let editDescription = $state('');
	let payoutSubmitting = $state(false);
	let submittedPayout = $state<ApprovalRequest | null>(null);

	const closed = $derived(isEventClosed(data.event));

	const approvalsQuery = useQuery<ApprovalRequest[]>(
		'approvals:mine',
		async () => {
			const response = await fetch('/api/approvals');
			return response.ok ? await response.json() : [];
		},
		{ staleTime: 5_000, refetchInterval: 10_000, enabled: !!page.data.session },
		(data as { approvals?: ApprovalRequest[] }).approvals
	);
	$effect(() => {
		const uid = page.data.session?.userId;
		if (!browser || !uid) return;
		return subscribeTable(
			'approval_requests',
			() => {
				void approvalsQuery.refetch();
			},
			`requester_id=eq.${uid}`
		);
	});
	const serverApprovals = $derived(
		Array.isArray(approvalsQuery.data)
			? approvalsQuery.data
			: ((data as { approvals?: ApprovalRequest[] }).approvals ?? [])
	);
	const mergedApprovals = $derived.by(() => {
		if (!submittedPayout) return serverApprovals;
		if (serverApprovals.some((a) => a.id === submittedPayout!.id)) return serverApprovals;
		return [submittedPayout, ...serverApprovals];
	});
	const payoutAccountRequest = $derived(
		mergedApprovals.find(
			(r) =>
				r.kind === 'verification' &&
				(r.payload as { check?: string } | undefined)?.check === 'payoutAccount'
		) ?? null
	);
	const approvedBankFromApproval = $derived.by(() => {
		if (payoutAccountRequest?.status !== 'approved') return null;
		const p = (payoutAccountRequest.payload ?? {}) as { bank?: string; accountNumber?: string };
		return p.bank ? { bank: p.bank, accountNumber: p.accountNumber ?? '' } : null;
	});
	const payout = $derived(
		appSettings.value.payout.bank
			? appSettings.value.payout
			: (approvedBankFromApproval ?? appSettings.value.payout)
	);
	const payoutLinked = $derived(
		(appSettings.value.verification.payoutAccount || payoutAccountRequest?.status === 'approved') &&
			!!payout.bank
	);
	const payoutDestination = $derived(payoutLinked ? payoutAccountLabel(payout) : '');
	const payoutRequest = $derived(resolveEventPayoutRequest(mergedApprovals, data.event.id));

	const tierRevenue = $derived(data.event.tiers.reduce((s, t) => s + t.sold * t.price, 0));
	const revenue = $derived(data.orders.length ? data.orders.reduce((s, o) => s + o.total, 0) : tierRevenue);
	const payoutAmount = $derived(Math.round((tierRevenue || revenue) * 0.35));

	async function requestPayout() {
		if (!closed) {
			toast('Payout request is only available after the event closes', 'info');
			return;
		}
		if (payoutRequest?.status === 'approved' || payoutRequest?.status === 'pending' || payoutSubmitting) {
			return;
		}
		if (!payoutLinked) {
			toast('Verify your payout account in Settings → Verification to receive payouts', 'info');
			return;
		}
		if (payoutAmount <= 0) {
			toast('There is no cleared balance to pay out for this event yet.', 'info');
			return;
		}
		payoutSubmitting = true;
		try {
			const response = await fetch('/api/approvals', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: 'payout',
					amount: payoutAmount,
					subjectId: data.event.id,
					subjectLabel: data.event.title,
					destination: payoutDestination,
					bank: payout.bank,
					accountNumber: payout.accountNumber,
					accountHolder: page.data.session?.name || ''
				})
			});
			const body = (await response.json().catch(() => ({}))) as Partial<ApprovalRequest> & {
				error?: string;
			};
			if (!response.ok) {
				toast(body.error ?? 'Your payout request could not be submitted.', 'error');
				return;
			}
			submittedPayout = {
				id: body.id ?? `ap-pending-${data.event.id}`,
				kind: 'payout',
				status: 'pending',
				requesterId: body.requesterId ?? page.data.session?.userId ?? 'demo',
				title: body.title ?? `Payout request · ${data.event.title}`,
				summary: body.summary ?? 'Cleared settlement balance requested',
				amount: body.amount ?? payoutAmount,
				subjectId: data.event.id,
				subjectLabel: data.event.title,
				payload: body.payload ?? { eventId: data.event.id, destination: payoutDestination },
				createdAt: body.createdAt ?? new Date().toISOString()
			};
			toast('Payout request sent for admin approval', 'success');
			void approvalsQuery.refetch();
		} catch {
			toast('Your payout request could not be submitted. Check your connection.', 'error');
		} finally {
			payoutSubmitting = false;
		}
	}

	function openEditEvent() {
		if (closed) return;
		editTitle = data.event.title;
		editVenue = data.event.venue;
		editCity = data.event.city;
		editDescription = data.event.description;
		editOpen = true;
	}

	const tabs: { id: typeof tab; label: string; icon: Snippet }[] = $derived([
		{ id: 'attendees', label: 'Attendees', icon: iconUsers },
		{ id: 'orders', label: 'Orders', icon: iconOrders },
		{ id: 'log', label: 'Check-in log', icon: iconLog }
	]);
</script>

<svelte:head><title>{data.event.title} • Manage • Owltside</title></svelte:head>

<main class="flex flex-col relative w-full pb-28 md:pb-16 bg-surface min-h-dvh">
	<!-- top bar -->
	<section class="border-b border-surface-glass-border">
		<div class="flex items-center px-gutter h-16 md:max-w-3xl md:mx-auto w-full gap-2">
			<a href={closed ? '/organizer?tab=past' : '/organizer'} aria-label="Back to console" class="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
				<ArrowLeft class="w-5.5 h-5.5" />
			</a>
			<div class="flex flex-col flex-1 min-w-0">
				<h1 class="font-display text-headline-md text-on-surface truncate leading-tight">{data.event.title}</h1>
				<span class="flex items-center gap-2 min-w-0">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{closed ? 'Past event' : 'Event management'}</span>
					<EventStatusBadge status={data.event.status} />
				</span>
			</div>
			{#if !closed}
				<button onclick={openEditEvent} aria-label="Edit event" class="w-11 h-11 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface hover:bg-surface-bright transition-colors">
					<Edit class="w-4.5 h-4.5" />
				</button>
				<a href="/organizer/scan" aria-label="Open scanner" class="w-11 h-11 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant/30 text-on-surface hover:bg-surface-bright transition-colors">
					<ScanBarcode class="w-5 h-5" />
				</a>
			{/if}
		</div>
	</section>

	<div class="flex flex-col w-full px-gutter md:max-w-3xl md:mx-auto gap-space-md pt-space-sm">
		<!-- review / lifecycle state -->
		{#if data.event.status !== 'published'}
			<div
				class="rounded-xl border p-4 flex items-start gap-3 {data.event.status === 'pending'
					? 'border-accent-amber/30 bg-accent-amber/10'
					: data.event.status === 'closed' || data.event.status === 'draft'
						? 'border-outline-variant/40 bg-surface-container-high'
						: 'border-error/30 bg-error/10'}"
			>
				<Info class="w-4 h-4 shrink-0 mt-0.5 {data.event.status === 'pending' ? 'text-accent-amber' : data.event.status === 'closed' || data.event.status === 'draft' ? 'text-on-surface-variant' : 'text-error'}" />
				<div class="min-w-0">
					<p class="text-body-sm font-semibold text-on-surface flex items-center gap-2">
						<EventStatusBadge status={data.event.status} />
					</p>
					<p class="text-body-sm text-on-surface-variant pt-1.5">
						{#if data.event.status === 'pending'}
							Your event is in the Owltside review queue. It appears on the home and explore feeds as soon as an admin approves it — no tickets can be sold before then.
						{:else if data.event.status === 'closed'}
							This event has closed. Editing, gate scanning, and announcements are locked — you can request your settlement payout below.
						{:else if data.event.status === 'rejected'}
							The review team sent this event back. Edit it to resubmit it for approval.
						{:else if data.event.status === 'suspended'}
							This event was removed from the public feeds by the review team.
						{:else}
							This event is still a draft. Submit it from the wizard to send it for review.
						{/if}
					</p>
					{#if data.event.moderationNote}
						<p class="text-body-sm text-on-surface pt-1.5"><span class="text-on-surface-variant">Review note:</span> {data.event.moderationNote}</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- mini stats -->
		<div class="grid grid-cols-3 gap-2">
			<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
				<p class="font-display text-headline-md-mobile text-on-surface">{data.tickets.length}</p>
				<p class="text-label-badge text-on-surface-variant uppercase">Tickets</p>
			</div>
			<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
				<p class="font-display text-headline-md-mobile text-accent-emerald">{data.checkins.filter((c) => c.result === 'verified').length}</p>
				<p class="text-label-badge text-on-surface-variant uppercase">Checked in</p>
			</div>
			<div class="rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-center">
				<p class="font-display text-headline-md-mobile text-on-surface">{formatMoney(revenue)}</p>
				<p class="text-label-badge text-on-surface-variant uppercase">Revenue</p>
			</div>
		</div>

		{#if closed}
			<!-- Only payout request is available on past events -->
			<section class="rounded-xl bg-surface-container border border-outline-variant/30 p-4 flex flex-col gap-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<span class="text-label-badge uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
							<Wallet class="w-3.5 h-3.5 text-accent-amber" /> Settlement Payout
						</span>
						<p class="font-display text-headline-md text-on-surface pt-1">{formatMoney(payoutAmount)}</p>
						<p class="text-body-sm text-on-surface-variant pt-0.5">
							{payoutLinked ? `Destination: ${payoutDestination}` : 'Verify your payout account in Settings → Verification'}
						</p>
					</div>
				</div>
				<PayoutRequestButton
					event={data.event}
					request={payoutRequest}
					submitting={payoutSubmitting}
					onclick={requestPayout}
				/>
				{#if payoutRequest}
					<ApprovalNotice
						request={payoutRequest}
						pendingLabel="Payout requested — awaiting admin approval"
						pendingBody="Your payout request is queued for the Owltside finance team."
						approvedLabel="Payout approved"
						approvedBody="Your settlement payout has been approved."
						rejectedLabel="Payout denied"
						rejectedBody="The review team denied this payout request."
					/>
				{/if}
			</section>
		{:else}
			<!-- tabs -->
			<div role="tablist" class="flex gap-1 p-1 rounded-full bg-surface-container border border-surface-glass-border overflow-x-auto no-scrollbar">
				{#each tabs as t (t.id)}
					<button
						role="tab"
						aria-selected={tab === t.id}
						class="flex-1 min-w-max px-4 py-2.5 rounded-full text-body-sm font-medium flex items-center gap-1.5 transition-all {tab === t.id ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-on-surface-variant'}"
						onclick={() => (tab = t.id)}
					>
						{@render t.icon()} {t.label}
					</button>
				{/each}
			</div>

			{#if tab === 'attendees'}
				<div class="flex items-center justify-between mb-2">
					<p class="text-body-sm text-on-surface-variant">{data.tickets.length} tickets issued</p>
					<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-label-badge font-semibold" onclick={() => { downloadCsv(`${data.event.slug}-attendees.csv`, ticketsToCsv(data.tickets)); toast('CSV exported'); }}>
						<Download class="w-3.5 h-3.5" /> Export CSV
					</button>
				</div>
				<div class="flex flex-col gap-2">
					{#each data.tickets as t (t.id)}
						<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-xl p-3">
							<div class="min-w-0">
								<p class="text-body-md text-on-surface font-medium truncate">{t.holder}</p>
								<p class="text-body-sm text-on-surface-variant font-code truncate">{t.code}</p>
							</div>
							<div class="flex flex-col items-end gap-1 flex-shrink-0">
								<span class="text-body-sm text-on-surface">{t.tierName}</span>
								<span class="px-2 py-0.5 rounded-full text-label-badge border {t.status === 'used' ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' : 'bg-surface-container-highest border-outline-variant/30 text-on-surface-variant'}">
									{t.status === 'used' ? 'Checked in' : t.status === 'refunded' ? 'Refunded' : 'Active'}
								</span>
							</div>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No tickets sold yet.</p>
					{/each}
				</div>
			{:else if tab === 'orders'}
				<div class="flex flex-col gap-2">
					{#each data.orders as o (o.id)}
						<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-xl p-3">
							<div class="min-w-0">
								<p class="text-body-sm text-on-surface font-code">{o.reference}</p>
								<p class="text-label-badge text-on-surface-variant">{fmtDateTime(o.at)} • {o.buyer} • {o.itemsLabel}</p>
							</div>
							<div class="flex flex-col items-end gap-1 flex-shrink-0">
								<p class="text-body-md text-on-surface font-semibold">{formatMoney(o.total)}</p>
								<span class="px-2 py-0.5 rounded-full text-label-badge border {o.status === 'refunded' ? 'bg-error/10 border-error/30 text-error' : 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'}">
									{o.status === 'refunded' ? 'Refunded' : 'Paid'}
								</span>
							</div>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No orders yet.</p>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#each data.checkins as c (c.id)}
						<div class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-xl p-3">
							<div class="min-w-0">
								<p class="text-body-md text-on-surface font-medium truncate">{c.holder}</p>
								<p class="text-label-badge text-on-surface-variant">{c.gate} • {fmtRelative(c.at)}</p>
							</div>
							<span class="px-2 py-0.5 rounded-full text-label-badge border capitalize {c.result === 'verified' ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' : c.result === 'duplicate' ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber' : 'bg-error/10 border-error/30 text-error'}">
								{c.result}
							</span>
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No scans recorded yet.</p>
					{/each}
				</div>
			{/if}

			<button onclick={() => (broadcastOpen = true)} class="w-full h-12 rounded-full bg-surface-container-high border border-outline-variant/40 text-on-surface text-body-md font-medium flex items-center justify-center gap-2">
				<Megaphone class="w-4 h-4 text-accent-amber" /> Broadcast to ticket holders
			</button>
		{/if}
	</div>
</main>

{#if !closed}
	<Sheet open={broadcastOpen} title="Broadcast" close={() => (broadcastOpen = false)}>
		{#snippet footer()}
			<button type="submit" form="broadcast-form" class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md disabled:opacity-40" disabled={!msg.trim()}>
				Send broadcast
			</button>
		{/snippet}
		<form
			id="broadcast-form"
			method="POST"
			action="?/broadcast"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') {
						const sent = Number(result.data?.sent ?? 0);
						broadcastOpen = false;
						msg = '';
						toast(
							sent > 0
								? `Announcement sent to ${sent} ticket holder${sent === 1 ? '' : 's'}`
								: 'No ticket holders to notify yet',
							sent > 0 ? 'success' : 'info'
						);
					}
				};
			}}
		>
			<textarea name="message" bind:value={msg} rows="4" placeholder="Write an announcement…" class="w-full px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
			<p class="text-label-badge text-on-surface-variant">Delivered to the notification hub of every pass owner of {data.event.title}.</p>
		</form>
	</Sheet>

	<Sheet open={editOpen} title="Edit event" close={() => (editOpen = false)}>
		{#snippet footer()}
			<div class="flex gap-2 w-full">
				<form method="POST" action="?/deleteEvent" use:enhance>
					<button type="submit" aria-label="Delete event" class="h-12 px-4 rounded-full bg-error/15 border border-error/30 text-error font-semibold text-body-sm flex items-center gap-1.5">
						<Trash2 class="w-4 h-4" /> Delete
					</button>
				</form>
				<button type="submit" form="edit-event-form" class="flex-1 h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md">
					Save changes
				</button>
			</div>
		{/snippet}
		<form
			id="edit-event-form"
			method="POST"
			action="?/updateEvent"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') {
						editOpen = false;
						toast('Event updated', 'success');
					}
				};
			}}
			class="flex flex-col gap-3"
		>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				Title
				<input name="title" bind:value={editTitle} required minlength="3" class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				Venue
				<input name="venue" bind:value={editVenue} required class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				City
				<input name="city" bind:value={editCity} required class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md" />
			</label>
			<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
				Description
				<textarea name="description" bind:value={editDescription} rows="4" class="px-3 py-2.5 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md"></textarea>
			</label>
		</form>
	</Sheet>
{/if}

{#snippet iconUsers()}<Users class="w-4 h-4" />{/snippet}
{#snippet iconOrders()}<Receipt class="w-4 h-4" />{/snippet}
{#snippet iconLog()}<UserCheck class="w-4 h-4" />{/snippet}

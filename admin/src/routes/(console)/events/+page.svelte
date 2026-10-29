<script lang="ts">
	import {
		BadgeCheck,
		CalendarDays,
		ChevronRight,
		Download,
		ExternalLink,
		Eye,
		ScanLine,
		ShieldCheck
	} from '@lucide/svelte';
	import { chipClass, eventStatus } from '$admin/utils/status';
	import { countdown, date, money, num, pct, time } from '$admin/utils/format';
	import type { AdminEvent } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import CoverArt from '$components/CoverArt.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import SearchField from '$components/SearchField.svelte';
	import SubmissionQueue from '$components/SubmissionQueue.svelte';

	let { data } = $props();

	let selectedOverride = $state<string | null>(null);

	const combined = $derived([...(data.table?.rows ?? []), ...(data.pending ?? [])]);
	const selected = $derived<AdminEvent | null>(
		combined.find((event) => event.id === (selectedOverride ?? data.selectedId)) ??
			(data.pending ?? [])[0] ??
			(data.table?.rows ?? [])[0] ??
			null
	);

	function submitFilters(event: Event) {
		const formElement = event.currentTarget as HTMLSelectElement;
		formElement.form?.requestSubmit();
	}
</script>

<svelte:head><title>Events · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Events Management"
		subtitle="Review, moderate, monitor capacity, and manage all events across Owltside. Events are loaded live from public.events in Supabase."
		crumbs={['platform', 'events']}
		eyebrow="Supabase · live data"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/events" download>
				<Download size={12} /> Export Roster (CSV)
			</a>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
		<div class="panel p-4">
			<p class="mono-label">Total events</p>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">100% pool</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Published</p><span class="status-dot"></span></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.published)}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">{pct(data.counts.total ? data.counts.published / data.counts.total * 100 : 0, 1)} future events</p>
		</div>
		<div class="panel border-amber-400/25 bg-amber-400/[0.03] p-4">
			<div class="flex items-center justify-between"><p class="mono-label !text-amber-200/80">Pending review</p><span class="chip chip-warn !h-[17px] !text-[8px]">Needs action</span></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-amber-100">{String(data.counts.pending).padStart(2, '0')}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#8f8f9b]">Queue SLA · 2h</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Drafts</p>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.draft)}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">Inactive</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Suspended</p><span class="chip chip-danger !h-[17px] !text-[8px]">Flagged</span></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{String(data.counts.suspended).padStart(2, '0')}</p>
			<p class="mt-1.5 font-code text-[9px] uppercase tracking-[0.06em] text-[#6f6f7b]">Policy breach</p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search by event title, ID, venue…" class="xl:w-[290px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={submitFilters} aria-label="Filter by status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All active</option>
					<option value="published" selected={data.filters.status === 'published'}>Published</option>
					<option value="pending" selected={data.filters.status === 'pending'}>Pending review</option>
					<option value="draft" selected={data.filters.status === 'draft'}>Drafts</option>
					<option value="suspended" selected={data.filters.status === 'suspended'}>Suspended</option>
				</select>
				<select name="category" class="select !h-[34px] !text-[11.5px]" onchange={submitFilters} aria-label="Filter by category">
					<option value="all" selected={data.filters.category === 'all'}>Category: All</option>
					{#each (data.options?.categories ?? []) as category}
						<option value={category} selected={data.filters.category === category}>{category}</option>
					{/each}
				</select>
				<select name="organizer" class="select !h-[34px] !text-[11.5px]" onchange={submitFilters} aria-label="Filter by organizer">
					<option value="all" selected={data.filters.organizer === 'all'}>Org: All verified</option>
					{#each (data.options?.organizers ?? []) as organizer}
						<option value={organizer} selected={data.filters.organizer === organizer}>{organizer}</option>
					{/each}
				</select>
				<select name="sort" class="select !h-[34px] !text-[11.5px]" onchange={submitFilters} aria-label="Sort events">
					<option value="date" selected={data.filters.sort === 'date'}>Sort: Event date</option>
					<option value="newest" selected={data.filters.sort === 'newest'}>Sort: Newest</option>
					<option value="gmv" selected={data.filters.sort === 'gmv'}>Sort: GMV</option>
				</select>
			</div>
			<a href="/events" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<SubmissionQueue rows={data.submissions ?? []} error={data.submissionError ?? ''} />

	<div class="grid grid-cols-1 gap-2.5 min-[1400px]:grid-cols-[1.68fr_1fr]">
		<section class="panel min-w-0 overflow-hidden">
			<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
				<p class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">
					Event registry <span class="text-[#54545f]">· {(data.table?.total ?? 0)} records</span>
				</p>
				<span class="chip !h-[18px] !text-[8px]">{(data.table?.rows ?? []).length} shown</span>
			</div>
			{#if (data.table?.rows ?? []).length === 0}
				<EmptyState title="No events matched" message="Adjust the status, category or organizer filters." />
			{:else}
				<div class="table-wrap">
					<table class="tbl tbl-tight">
						<thead>
							<tr>
								<th>Event & cover</th>
								<th>Organizer</th>
								<th>Date & schedule</th>
								<th class="hidden !text-right 2xl:table-cell">Sold</th>
								<th>Status</th>
								<th class="!text-right"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							{#each (data.table?.rows ?? []) as event (event.id)}
								{@const meta = eventStatus(event.status)}
								<tr data-selected={selected?.id === event.id}>
									<td class="min-w-[190px]">
										<div class="flex items-center gap-2.5">
											<CoverArt from={event.coverFrom} to={event.coverTo} icon={event.coverIcon} compact />
											<div class="min-w-0">
												<button
													type="button"
													class="block max-w-[160px] truncate text-left text-[11.5px] font-medium text-[#ececf1] hover:text-[#c6bcff]"
													onclick={() => (selectedOverride = event.id)}
												>
													{event.title}
												</button>
												<div class="mt-1 flex flex-wrap items-center gap-1">
													<span class="chip !h-[16px] !text-[7.5px]">{event.ref}</span>
													<span class="chip chip-accent !h-[16px] !text-[7.5px]">{event.category}</span>
													{#if selected?.id === event.id}
														<span class="chip chip-info !h-[16px] !text-[7.5px]">Inspecting</span>
													{/if}
												</div>
											</div>
										</div>
									</td>
									<td>
										<p class="primary-cell flex items-center gap-1 text-[11px]">
											{event.organizerName}
											<BadgeCheck size={11} class="text-[#8dd3c7]" />
										</p>
										<p class="mt-0.5 font-code text-[8.5px] uppercase tracking-[0.06em] text-[#6f6f7b]">
											Tier {event.organizerTier} KYB
										</p>
									</td>
									<td>
										<p class="primary-cell whitespace-nowrap text-[11px]">{date(event.startsAt)} <span class="text-[#6f6f7b]">{time(event.startsAt)}</span></p>
										<p class="mt-0.5 max-w-[186px] truncate font-code text-[8.5px] uppercase tracking-[0.06em] text-[#6f6f7b]">
											{event.startsAt < new Date().toISOString() ? 'Completed' : countdown(event.startsAt)} · {event.city.split(',')[0]}
										</p>
									</td>
									<td class="num hidden 2xl:table-cell">{event.sold.toLocaleString('en-US')}<span class="text-[#54545f]">/{event.capacity.toLocaleString('en-US')}</span></td>
									<td><StatusChip label={meta.label} tone={meta.tone} /></td>
									<td>
										<div class="flex items-center justify-end gap-1">
											<button type="button" class="row-action" aria-label={`Inspect ${event.title}`} onclick={() => (selectedOverride = event.id)}>
												<Eye size={13} />
											</button>
											<a href={`/events/${event.id}`} class="row-action" aria-label={`Open ${event.title}`}>
												<ChevronRight size={13} />
											</a>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<Pagination pageNumber={data.table?.page ?? 1} pages={data.table?.pages ?? 1} total={data.table?.total ?? 0} perPage={data.table?.perPage ?? 7} label="events" />
		</section>

		<!-- Dossier / moderation panel -->
		<aside class="min-w-0">
			{#if selected}
				{@const meta = eventStatus(selected.status)}
				<div class="panel sticky top-[76px] overflow-hidden">
					<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
						<div class="flex items-center gap-2">
							<p class="mono-label">
								{selected.status === 'pending' ? 'Pending event review' : 'Event dossier'}
							</p>
							{#if selected.status === 'pending'}
								<span class="chip !h-[16px] !text-[7.5px]">1 of {(data.pending ?? []).length}</span>
							{/if}
						</div>
						<a href={`/events/${selected.id}`} class="font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline">Open dossier ↗</a>
					</div>

					<div class="p-4">
						<div class="flex items-start gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-code text-[8px] uppercase tracking-[0.12em] text-[#6f6f7b]">{selected.ref}</p>
								<h3 class="mt-1 font-display text-[15px] font-semibold leading-snug text-[#f0f0f5]">{selected.title}</h3>
								<div class="mt-1.5 flex flex-wrap gap-1">
									<StatusChip label={meta.label} tone={meta.tone} />
									<span class="chip !h-[16px] !text-[7.5px]">{selected.category}</span>
								</div>
							</div>
						</div>

						<div class="mt-3 overflow-hidden rounded-lg border border-[#2a2a32]">
							<CoverArt from={selected.coverFrom} to={selected.coverTo} icon={selected.coverIcon} class="!h-28 !w-full !rounded-none" />
						</div>

						<p class="mt-3 text-[11px] leading-relaxed text-[#8f8f9b]">{selected.moderationNote ?? selected.venue + ' · ' + selected.city}</p>

						<div class="mt-3 flex items-center gap-2 rounded-lg border border-[#26262e] bg-[#191920] p-2">
							<span class="flex h-7 w-7 items-center justify-center rounded-md bg-[#2a2540] font-code text-[9px] text-[#c6bcff]">
								{selected.organizerName.slice(0, 2).toUpperCase()}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[11px] text-[#dcdce4]">{selected.organizerName}</p>
								<p class="font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Tier {selected.organizerTier} · KYB verified</p>
							</div>
							<a href={`/organizers/${selected.organizerId}`} class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">Profile</a>
						</div>

						<div class="mt-4">
							<p class="mono-label !text-[8px]">Ticket structure & pricing</p>
							<div class="mt-1.5 space-y-1">
								{#each selected.tiers as tier}
									<div class="flex items-center justify-between border-b border-[#24242c] py-1.5 last:border-0">
										<span class="text-[10.5px] text-[#b7b7c2]">{tier.name}</span>
										<span class="font-code text-[9.5px] text-[#8f8f9b]">{num(tier.capacity)} seats</span>
										<span class="font-code text-[10px] text-[#ececf1]">{money(tier.priceNgn)}</span>
									</div>
								{/each}
							</div>
						</div>

						<div class="mt-4">
							<p class="mono-label !text-[8px]">Security & compliance</p>
							<ul class="mt-1.5 space-y-1.5">
								<li class="flex items-center gap-1.5 text-[10.5px] text-[#a7a7b3]"><ShieldCheck size={12} class="text-emerald-400" /> QR pass registry · active</li>
								<li class="flex items-center gap-1.5 text-[10.5px] text-[#a7a7b3]"><BadgeCheck size={12} class="text-emerald-400" /> Paystack merchant subaccount · bound</li>
								<li class="flex items-center gap-1.5 text-[10.5px] text-[#a7a7b3]"><ScanLine size={12} class="text-emerald-400" /> Wallet delivery enabled for all tiers</li>
							</ul>
						</div>

						<div class="mt-4 space-y-1.5 border-t border-[#26262e] pt-3">
							<a href={`/events/${selected.id}`} class="btn btn-primary w-full">Open event record</a>
						</div>
					</div>

					<div class="flex items-start gap-2 border-t border-[#26262e] bg-[#17171c] px-4 py-2.5">
						<ShieldCheck size={12} class="mt-0.5 shrink-0 text-[#6f6f7b]" />
						<p class="text-[9.5px] leading-relaxed text-[#6f6f7b]">
							Owltside publishing policy v2.4 — events with total capacity above 1,000 attendees require automated
							perimeter dispatch confirmation before ticket sales go live.
						</p>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>

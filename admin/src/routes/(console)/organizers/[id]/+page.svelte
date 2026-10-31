<script lang="ts">
	import {
		ArrowLeft,
		BadgeCheck,
		Ban,
		CalendarDays,
		Check,
		Download,
		FileText,
		Landmark,
		MapPin,
		Receipt,
		ShieldAlert,
		ZoomIn
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, eventStatus, organizerStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative, shortDate } from '$admin/utils/format';
	import type { AdminApprovalAttachment, AdminOrganizer } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import CoverArt from '$components/CoverArt.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let busy = $state(false);
	let previewAttachment = $state<AdminApprovalAttachment | null>(null);

	const org = $derived(data.organizer);
	const status = $derived(organizerStatus(org.status));
	const published = $derived(data.events.filter((event) => event.status === 'published'));

	async function updateOrganizerStatus(next: AdminOrganizer['status']) {
		busy = true;
		const res = await fetch(`/api/organizers/${org.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				status: next,
				reason:
					next === 'suspended'
						? 'Disabled from Organizer Dossier'
						: 'Updated from Organizer Dossier'
			})
		});
		const payload = (await res.json().catch(() => ({}))) as { message?: string };
		busy = false;
		if (!res.ok) {
			toasts.error('Update failed', payload.message ?? 'Could not update organizer.');
			return;
		}
		toasts.ok('Organizer updated', `${org.name} is now ${next}.`);
		await invalidateAll();
	}

	function exportDossier() {
		const blob = new Blob([JSON.stringify({ organizer: org, events: data.events }, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${org.slug}-kyb-dossier.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		toasts.ok('KYB dossier exported', `${org.slug}-kyb-dossier.json saved.`);
	}
</script>

<svelte:head><title>{org.name} · Organizers · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title={org.name}
		subtitle={`@${org.slug} · ${org.contactEmail || 'No email'} · ${org.contactPhone || 'No phone'}`}
		crumbs={['platform', 'organizers', org.slug]}
		eyebrow={`Live organizer · ${status.label}`}
	>
		{#snippet actions()}
			<a href="/organizers" class="btn btn-sm"><ArrowLeft size={12} /> Back to registry</a>
			<button type="button" class="btn btn-sm" onclick={exportDossier}>
				<Download size={12} /> Export dossier
			</button>
			{#if org.status !== 'verified'}
				<button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={() => updateOrganizerStatus('verified')}>
					<BadgeCheck size={12} /> Verify organizer
				</button>
			{/if}
			{#if org.status !== 'suspended'}
				<button type="button" class="btn btn-sm btn-danger-soft" disabled={busy} onclick={() => updateOrganizerStatus('suspended')}>
					<Ban size={12} /> Disable organizer
				</button>
			{:else}
				<button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={() => updateOrganizerStatus('pending')}>
					<Check size={12} /> Re-enable organizer
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if org.flagReason && org.status === 'suspended'}
		<div class="panel border border-rose-500/30 bg-rose-500/[0.06] p-3.5 text-[11.5px] text-rose-200">
			<strong>Suspended reason:</strong> {org.flagReason}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<p class="mono-label">Verification status</p>
			<div class="mt-2"><StatusChip label={status.label} tone={status.tone} /></div>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">User ID: {org.id.slice(0, 8)}</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Gross volume</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(org.grossVolumeNgn)}</p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">{num(org.ticketsSold)} tickets across {org.eventsCount} events</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Settlement bank (unmasked)</p>
			<p class="mt-1.5 font-code text-[13px] font-semibold select-all text-emerald-300">{org.settlementAccountNumber || 'Not linked'}</p>
			<p class="mt-1 text-[10px] text-[#a0a0ab]">{org.settlementBank || 'No bank submitted'} · {org.settlementAccountHolder || org.name}</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Government ID (unmasked)</p>
			<p class="mt-1.5 truncate font-code text-[13px] font-semibold select-all text-emerald-300">{org.kycReference || 'Not submitted'}</p>
			<p class="mt-1 text-[10px] text-[#a0a0ab]">{org.kycDocument || 'No KYC document'}</p>
		</div>
	</div>

	<div class="grid grid-cols-1 items-start gap-3 xl:grid-cols-[1.55fr_1fr]">
		<div class="min-w-0 space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head">
					<div class="flex items-center gap-2"><CalendarDays size={12} class="text-[#8f8f9b]" /><p class="mono-label">Organizer events</p></div>
					<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">{published.length} published / {data.events.length} total</span>
				</header>
				<div class="divide-y divide-[#24242c]">
					{#each data.events as event (event.id)}
						<a href={`/events/${event.id}`} class="flex items-center gap-3 px-3.5 py-2.5 transition hover:bg-[#1b1b22]">
							<CoverArt from={event.coverFrom} to={event.coverTo} icon={event.coverIcon} compact class="!h-9 !w-9" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-[11.5px] font-medium text-[#e8e8ee]">{event.title}</p>
								<p class="font-code text-[8px] text-[#6f6f7b]">{event.ref} · {event.venue} · {shortDate(event.startsAt)}</p>
							</div>
							<div class="hidden text-right sm:block">
								<p class="font-code text-[10px] text-[#dcdce4]">{money(event.grossNgn)}</p>
								<p class="font-code text-[8px] text-[#6f6f7b]">{num(event.sold)} / {num(event.capacity)} sold</p>
							</div>
							<span class={chipClass(eventStatus(event.status).tone)}>{eventStatus(event.status).label}</span>
						</a>
					{:else}
						<p class="px-3.5 py-5 text-center text-[11px] text-[#6f6f7b]">No events submitted yet.</p>
					{/each}
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Recent orders</p><Receipt size={12} class="text-[#8f8f9b]" /></header>
				<div class="divide-y divide-[#24242c]">
					{#each data.orders as order}
						<a href={`/orders?order=${order.id}`} class="flex items-center gap-2 px-3.5 py-2 hover:bg-[#1b1b22]">
							<div class="min-w-0 flex-1">
								<p class="truncate font-code text-[9.5px] text-[#dcdce4]">{order.reference}</p>
								<p class="truncate text-[8px] text-[#6f6f7b]">{order.customerName} · {relative(order.createdAt)}</p>
							</div>
							<span class="font-code text-[10px] text-[#e6e6ec]">{money(order.totalNgn)}</span>
						</a>
					{:else}
						<p class="px-3.5 py-3 text-[10.5px] text-[#6f6f7b]">No transactions indexed.</p>
					{/each}
				</div>
			</section>
		</div>

		<div class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Unmasked identity & bank profile</p><Landmark size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-1.5 p-3.5 text-[10.5px]">
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Legal name</span><span class="truncate text-right font-code select-all text-[#ededf4]">{org.legalName}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Date of birth</span><span class="font-code text-[#ededf4]">{org.kycDateOfBirth || '—'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">ID document</span><span class="font-code text-[#ededf4]">{org.kycDocument || '—'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">ID / NIN / BVN #</span><span class="font-code font-semibold select-all text-emerald-300">{org.kycReference || '—'}</span></p>
					<p class="flex justify-between gap-3 border-t border-[#24242c] pt-1.5"><span class="text-[#8f8f9b]">Settlement bank</span><span class="font-code text-[#ededf4]">{org.settlementBank || '—'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Full NUBAN</span><span class="font-code font-semibold select-all text-emerald-300">{org.settlementAccountNumber || '—'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Account holder</span><span class="font-code text-[#ededf4]">{org.settlementAccountHolder || org.name}</span></p>
					<p class="flex justify-between gap-3 border-t border-[#24242c] pt-1.5"><span class="text-[#8f8f9b]">Email</span><span class="truncate font-code select-all text-[#c6bcff]">{org.contactEmail || '—'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Phone</span><span class="font-code select-all text-[#ededf4]">{org.contactPhone || '—'}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">City</span><span class="flex items-center gap-1 text-right text-[#dcdce4]"><MapPin size={9} class="text-[#6f6f7b]" /> {org.city}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Joined</span><span class="text-[#dcdce4]">{relative(org.createdAt)}</span></p>

					{#if org.kycAttachments && org.kycAttachments.length > 0}
						<div class="grid grid-cols-2 gap-2 pt-2">
							{#each org.kycAttachments as att}
								<button
									type="button"
									onclick={() => (previewAttachment = att)}
									class="flex items-center justify-between rounded border border-[#32323d] bg-[#14141b] px-2.5 py-2 font-code text-[9px] text-[#c6bcff] hover:border-[#7c60f6]"
								>
									<span class="truncate">{att.side.toUpperCase()} ID</span>
									{#if att.mimeType.startsWith('image/')}
										<ZoomIn size={11} />
									{:else}
										<FileText size={11} />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Compliance trail</p><ShieldAlert size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-2 p-3.5">
					{#each data.audit as record}
						<div class="border-l border-[#33333d] pl-2.5">
							<p class="font-code text-[8.5px] uppercase text-[#c9c9d4]">{record.action}</p>
							<p class="text-[9px] text-[#6f6f7b]">{record.actor} · {relative(record.at)}</p>
						</div>
					{:else}
						<p class="text-[10.5px] text-[#6f6f7b]">No session compliance actions recorded yet.</p>
					{/each}
				</div>
			</section>
		</div>
	</div>
</div>

<Sheet
	open={previewAttachment !== null}
	title={previewAttachment ? `${previewAttachment.side.toUpperCase()} ID · ${previewAttachment.name}` : 'ID Document'}
	subtitle="Uploaded KYC identity document"
	onclose={() => (previewAttachment = null)}
	width="680px"
>
	{#if previewAttachment?.dataUrl}
		<div class="space-y-3">
			{#if previewAttachment.mimeType.startsWith('image/')}
				<img src={previewAttachment.dataUrl} alt={previewAttachment.name} class="max-h-[72vh] w-full rounded-lg border border-[#2d2d37] bg-black object-contain" />
			{:else}
				<iframe src={previewAttachment.dataUrl} title={previewAttachment.name} class="h-[70vh] w-full rounded-lg border border-[#2d2d37] bg-white"></iframe>
			{/if}
			<div class="flex justify-end gap-2">
				<a href={previewAttachment.dataUrl} download={previewAttachment.name} class="btn btn-sm btn-primary">
					<Download size={12} /> Download original
				</a>
			</div>
		</div>
	{/if}
</Sheet>

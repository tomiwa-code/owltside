<script lang="ts">
	import { RotateCcw, ShieldCheck } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import type { AdminUser } from '$admin/types';
	import { toasts } from '$admin/state/toast.svelte';
	import StatusChip from './StatusChip.svelte';
	import Sheet from './Sheet.svelte';

	let { user, canRequest = false }: { user: AdminUser; canRequest?: boolean } = $props();
	let open = $state(false);
	let check = $state<'identity' | 'payoutAccount'>('identity');
	let reason = $state('');
	let busy = $state(false);
	let errorMessage = $state('');
	const canRequestIdentity = $derived(user.kycStatus === 'approved');
	const canRequestPayout = $derived(user.bankStatus === 'approved');
	const available = $derived(canRequestIdentity || canRequestPayout);
	const selectedApproved = $derived(check === 'identity' ? canRequestIdentity : canRequestPayout);
	const checks = $derived([
		{ label: 'Phone number', status: user.phoneStatus },
		{ label: 'Identity', status: user.kycStatus },
		{ label: 'Payout account', status: user.bankStatus }
	]);

	function statusLabel(status?: string) {
		if (status === 'approved') return 'Verified';
		if (status === 'pending') return 'Pending review';
		if (status === 'reverification_required') return 'Awaiting user';
		if (status === 'rejected') return 'Rejected';
		return 'Not verified';
	}

	function startRequest() {
		if (!canRequest || !available) return;
		check = canRequestIdentity ? 'identity' : 'payoutAccount';
		reason = '';
		errorMessage = '';
		open = true;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !canRequest || !selectedApproved || !reason.trim()) return;
		busy = true;
		errorMessage = '';
		try {
			const response = await fetch(`/api/users/${user.id}/reverify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ check, reason: reason.trim() })
			});
			const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
			if (!response.ok) {
				errorMessage = result.message ?? result.error ?? 'The request could not be saved. Please try again.';
				return;
			}
			toasts.ok('Re-verification requested', `${user.name} has been notified to submit new ${check === 'identity' ? 'identity' : 'payout account'} details.`);
			open = false;
			await invalidateAll().catch(() => undefined);
		} catch {
			errorMessage = 'The request could not be saved. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="rounded-lg border border-[#2a2a32] p-3" aria-label="User verification">
	<header class="mb-3 flex items-center justify-between gap-2">
		<p class="mono-label flex items-center gap-1.5"><ShieldCheck size={12} /> Verification</p>
		{#if canRequest}
			<button type="button" class="btn btn-sm" disabled={!available || busy} onclick={startRequest} title={available ? 'Request new identity or payout details' : 'Only approved checks can be requested again'}>
				<RotateCcw size={12} /> Re-verify
			</button>
		{/if}
	</header>
	<dl class="space-y-2 text-[10.5px]">
		<div class="flex items-center justify-between gap-2">
			<dt class="text-[#8f8f9b]">Email address</dt>
			<dd title={user.emailVerifiedAt ? `Confirmed ${user.emailVerifiedAt}` : undefined}>
				<StatusChip label={user.emailVerified ? 'Verified' : user.email ? 'Not verified' : 'Unavailable'} tone={user.emailVerified ? 'ok' : 'neutral'} />
			</dd>
		</div>
		{#each checks as item}
			<div class="flex items-center justify-between gap-2">
				<dt class="text-[#8f8f9b]">{item.label}</dt>
				<dd><StatusChip label={statusLabel(item.status)} tone={item.status === 'approved' ? 'ok' : item.status === 'rejected' ? 'danger' : item.status === 'pending' || item.status === 'reverification_required' ? 'warn' : 'neutral'} /></dd>
			</div>
		{/each}
	</dl>
</section>

<Sheet open={open} title="Request re-verification" subtitle={`${user.name} (@${user.handle})`} onclose={() => { if (!busy) open = false; }}>
	<form class="space-y-4" onsubmit={submit}>
		<p class="text-[11.5px] leading-relaxed text-[#a0a0ab]">The selected check will no longer be verified. The user will receive your reason and must submit updated details for admin approval.</p>
		<label class="block space-y-1.5 text-[11px] text-[#dcdce4]">
			<span>Verification check</span>
			<select class="input w-full" bind:value={check} disabled={busy}>
				<option value="identity" disabled={!canRequestIdentity}>Identity — {statusLabel(user.kycStatus)}</option>
				<option value="payoutAccount" disabled={!canRequestPayout}>Payout account — {statusLabel(user.bankStatus)}</option>
			</select>
		</label>
		<label class="block space-y-1.5 text-[11px] text-[#dcdce4]">
			<span>Reason shown to the user</span>
			<textarea class="input w-full min-h-28" bind:value={reason} required maxlength="1000" disabled={busy} placeholder="Explain which details need updating and why."></textarea>
		</label>
		{#if errorMessage}<p role="alert" class="text-[11px] text-rose-300">{errorMessage}</p>{/if}
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm" disabled={busy} onclick={() => (open = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-primary" disabled={busy || !reason.trim() || !selectedApproved}>
				{busy ? 'Requesting…' : 'Request re-verification'}
			</button>
		</div>
	</form>
</Sheet>

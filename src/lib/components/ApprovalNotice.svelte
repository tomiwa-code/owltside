<script lang="ts">
	import { CircleCheck, Clock3, TriangleAlert } from '@lucide/svelte';
	import type { ApprovalRequest } from '$lib/types';

	/**
	 * Shared "waiting on the review team" notice. Anything that needs an admin
	 * decision renders one of these on the public app so the state is never
	 * implied to be approved before it actually is.
	 */
	let {
		request,
		pendingLabel = 'Pending approval',
		pendingBody = 'Your request is with the Owltside review team. We will notify you as soon as it is decided.',
		approvedLabel = 'Approved',
		approvedBody = 'Approved by the Owltside review team.',
		rejectedLabel = 'Request declined',
		rejectedBody = 'The review team declined this request.',
		class: className = ''
	}: {
		request: ApprovalRequest | null | undefined;
		pendingLabel?: string;
		pendingBody?: string;
		approvedLabel?: string;
		approvedBody?: string;
		rejectedLabel?: string;
		rejectedBody?: string;
		class?: string;
	} = $props();

	const state = $derived(request?.status ?? 'none');
	const label = $derived(
		state === 'pending'
			? pendingLabel
			: state === 'approved'
				? approvedLabel
				: state === 'rejected'
					? rejectedLabel
					: ''
	);
	const body = $derived(
		state === 'pending'
			? pendingBody
			: state === 'approved'
				? request?.note || approvedBody
				: state === 'rejected'
					? request?.note || rejectedBody
					: ''
	);
</script>

{#if state !== 'none'}
	<div
		class="rounded-lg border px-3 py-2.5 text-body-sm flex items-start gap-2.5 {state === 'pending'
			? 'bg-accent-amber/10 border-accent-amber/30 text-on-surface'
			: state === 'approved'
				? 'bg-accent-emerald/10 border-accent-emerald/30 text-on-surface'
				: 'bg-error/10 border-error/30 text-on-surface'} {className}"
		role="status"
		data-approval-state={state}
	>
		{#if state === 'pending'}
			<Clock3 class="w-4 h-4 shrink-0 mt-0.5 text-accent-amber" />
		{:else if state === 'approved'}
			<CircleCheck class="w-4 h-4 shrink-0 mt-0.5 text-accent-emerald" />
		{:else}
			<TriangleAlert class="w-4 h-4 shrink-0 mt-0.5 text-error" />
		{/if}
		<div class="min-w-0">
			<p class="font-semibold">{label}</p>
			<p class="text-on-surface-variant mt-0.5">{body}</p>
		</div>
	</div>
{/if}

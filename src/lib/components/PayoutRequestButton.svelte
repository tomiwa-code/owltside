<script lang="ts">
	import { Ban, CircleCheck, Clock3, Send } from '@lucide/svelte';
	import type { ApprovalRequest, EventItem } from '$lib/types';
	import { eventPayoutButtonState, type EventLifecycleInput } from '$lib/utils/event-status';

	let {
		event,
		request = null,
		submitting = false,
		compact = false,
		class: className = '',
		onclick
	}: {
		event: (Pick<EventItem, 'status'> | EventLifecycleInput) | null | undefined;
		request?: ApprovalRequest | null;
		submitting?: boolean;
		compact?: boolean;
		class?: string;
		onclick?: () => void;
	} = $props();

	const ui = $derived(eventPayoutButtonState(event, request, submitting));

	const toneClasses = $derived.by(() => {
		switch (ui.state) {
			case 'approved':
				return 'bg-emerald-600 border-emerald-500 text-white cursor-not-allowed';
			case 'denied':
				return 'bg-red-600 border-red-500 text-white hover:bg-red-500';
			case 'requested':
				return 'bg-accent-amber/15 border-accent-amber/40 text-accent-amber cursor-not-allowed';
			case 'locked':
				return 'bg-surface-container-high border-surface-glass-border text-on-surface-variant opacity-55 cursor-not-allowed';
			case 'submitting':
				return 'bg-surface-container-high border-surface-glass-border text-on-surface-variant opacity-75 cursor-wait';
			case 'available':
			default:
				return 'bg-primary text-on-primary border-primary hover:opacity-90 active:scale-[0.99]';
		}
	});

	const titleText = $derived.by(() => {
		switch (ui.state) {
			case 'approved':
				return 'Payout approved — cannot be requested again';
			case 'requested':
				return 'Your payout request is awaiting admin approval';
			case 'denied':
				return request?.note
					? `Payout denied: ${request.note}`
					: 'Payout request denied by admin';
			case 'locked':
				return 'Payout request is only available after the event closes';
			default:
				return undefined;
		}
	});
</script>

<button
	type="button"
	disabled={ui.disabled}
	title={titleText}
	data-payout-state={ui.state}
	onclick={() => {
		if (!ui.disabled) onclick?.();
	}}
	class="{compact
		? 'w-full h-8 rounded-full px-3 text-label-badge font-semibold gap-1.5'
		: 'w-full h-9 rounded-md px-4 text-body-sm font-semibold gap-2'} border flex items-center justify-center transition-all {toneClasses} {className}"
>
	{#if ui.state === 'approved'}
		<CircleCheck class={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />
	{:else if ui.state === 'denied'}
		<Ban class={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />
	{:else if ui.state === 'requested'}
		<Clock3 class={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />
	{:else}
		<Send class={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />
	{/if}
	<span>{ui.label}</span>
</button>

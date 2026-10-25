<script lang="ts">
	import type { EventStatus } from '$lib/types';
	import { eventStatusMeta } from '$lib/utils/event-status';

	let {
		status,
		class: extra = '',
		size = 'sm'
	}: { status: EventStatus; class?: string; size?: 'sm' | 'md' } = $props();

	const meta = $derived(eventStatusMeta(status));

	// Published is the expected state, so it gets the calm emerald tone while a
	// pending review is amber (action required) and rejections/suspensions red.
	const tone = $derived(
		status === 'published'
			? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
			: status === 'pending'
				? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber'
				: status === 'draft'
					? 'bg-surface-container-highest border-outline-variant/30 text-on-surface-variant'
					: 'bg-error/10 border-error/30 text-error'
	);

	const sizes = $derived(
		size === 'md'
			? 'px-2.5 py-1 text-label-badge'
			: 'px-2 py-0.5 text-label-badge'
	);
</script>

<span
	class="inline-flex items-center gap-1 rounded-full border {tone} {sizes} {extra}"
	title={meta.description}
	data-event-status={status}
>
	<span class="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
	{meta.label}
</span>

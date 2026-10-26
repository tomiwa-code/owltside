<script lang="ts">
	import type { Tone } from '$admin/utils/status';
	import { chipClass } from '$admin/utils/status';

	let {
		label,
		tone = 'neutral',
		dot = false
	}: { label: string; tone?: Tone; dot?: boolean } = $props();
</script>

<span class={chipClass(tone)}>
	{#if dot}
		<span
			class="h-1 w-1 rounded-full {tone === 'ok'
				? 'bg-emerald-400'
				: tone === 'danger'
					? 'bg-red-400'
					: tone === 'warn'
						? 'bg-amber-400'
						: 'bg-[#c6bcff]'}"
		></span>
	{/if}
	{label}
</span>

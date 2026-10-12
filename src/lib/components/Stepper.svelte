<script lang="ts">
	import { Minus, Plus } from '@lucide/svelte';

	let { value, min = 0, max = 10, onchange }: {
		value: number;
		min?: number;
		max?: number;
		onchange: (v: number) => void;
	} = $props();
</script>

<div class="flex items-center gap-2">
	<button
		aria-label="Decrease"
		disabled={value <= min}
		class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center disabled:opacity-40 hover:bg-surface-container-highest"
		onclick={() => onchange(Math.max(min, value - 1))}
	>
		<Minus class="w-4 h-4" />
	</button>
	<span class="w-8 text-center font-code text-label-code text-on-surface">{value}</span>
	<button
		aria-label="Increase"
		disabled={value >= max}
		class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center disabled:opacity-40 hover:bg-primary hover:text-on-primary"
		onclick={() => onchange(Math.min(max, value + 1))}
	>
		<Plus class="w-4 h-4" />
	</button>
</div>

<script lang="ts">
	import { ArrowLeftRight } from '@lucide/svelte';
	import { currency } from '$lib/state/prefs.svelte';
</script>

<button
	aria-label="Toggle currency display"
	class="flex items-center bg-surface-container-high px-2 py-1 rounded-full gap-1 shadow-sm active:scale-95 transition-transform"
	onclick={() => (currency.value = currency.value === 'NGN' ? 'USD' : 'NGN')}
>
	<span class="text-label-badge font-bold {currency.value === 'NGN' ? 'text-primary' : 'text-on-surface-variant'}">NGN</span>
	<span class="text-on-surface-variant text-[10px]">/</span>
	<span class="text-label-badge {currency.value === 'USD' ? 'text-primary' : 'text-on-surface-variant'}">USD</span>
	<ArrowLeftRight class="w-3.5 h-3.5 text-primary" />
</button>

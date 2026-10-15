<script lang="ts">
	import { CheckCircle2, Loader2 } from '@lucide/svelte';
</script>

<div class="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
	<div class="w-16 h-16 rounded-full bg-accent-emerald/20 flex items-center justify-center text-accent-emerald mb-4 animate-pulse">
		<Loader2 class="w-8 h-8 animate-spin" />
	</div>
	<h1 class="text-2xl font-bold font-display text-on-surface">Confirming your order...</h1>
	<p class="text-body-md text-on-surface-variant mt-2 max-w-sm">
		Please wait while we secure your gate pass and encrypt your rotating QR ticket.
	</p>
</div>

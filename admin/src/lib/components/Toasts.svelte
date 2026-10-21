<script lang="ts">
	import { CircleAlert, CircleCheck, Info, X } from '@lucide/svelte';
	import { toasts } from '$admin/state/toast.svelte';

	const styles = {
		ok: 'border-emerald-500/30 bg-[#16211c] text-emerald-200',
		error: 'border-red-500/30 bg-[#231616] text-red-200',
		info: 'border-[#3c3c46] bg-[#1d1d24] text-[#ececf1]'
	} as const;
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 sm:p-6">
	{#each toasts.items as item (item.id)}
		<div
			class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl shadow-black/50 animate-fade-up {styles[item.tone]}"
			role="status"
		>
			{#if item.tone === 'ok'}
				<CircleCheck size={16} class="mt-0.5 shrink-0" />
			{:else if item.tone === 'error'}
				<CircleAlert size={16} class="mt-0.5 shrink-0" />
			{:else}
				<Info size={16} class="mt-0.5 shrink-0" />
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-[12.5px] font-medium">{item.title}</p>
				{#if item.message}
					<p class="mt-0.5 text-[11.5px] leading-snug opacity-80">{item.message}</p>
				{/if}
			</div>
			<button
				type="button"
				class="rounded p-0.5 opacity-60 hover:opacity-100"
				aria-label="Dismiss notification"
				onclick={() => toasts.dismiss(item.id)}
			>
				<X size={13} />
			</button>
		</div>
	{/each}
</div>

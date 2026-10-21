<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		open = false,
		title,
		subtitle,
		onclose,
		children,
		footer,
		width = '460px'
	}: {
		open?: boolean;
		title: string;
		subtitle?: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
		width?: string;
	} = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50">
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default bg-black/65 backdrop-blur-[2px] animate-fade-in"
			aria-label="Close panel"
			onclick={onclose}
		></button>
		<div
			class="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#2f2f38] bg-[#121216] shadow-[0_0_80px_rgba(0,0,0,0.65)] animate-slide-in"
			style={`max-width:${width}`}
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<header class="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
				<div>
					<h2 class="font-display text-[16px] font-semibold text-[#f1f1f6]">{title}</h2>
					{#if subtitle}
						<p class="mt-0.5 text-[11.5px] leading-snug text-[#8f8f9b]">{subtitle}</p>
					{/if}
				</div>
				<button type="button" class="row-action !h-7 !w-7" aria-label="Close" onclick={onclose}>
					<X size={14} />
				</button>
			</header>
			<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				{@render children()}
			</div>
			{#if footer}
				<footer class="border-t border-line px-5 py-3">{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}

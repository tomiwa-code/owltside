<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import { ArrowDownRight, ArrowUpRight } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { Tone } from '$admin/utils/status';

	let {
		label,
		value,
		sub,
		icon: Icon,
		delta,
		deltaTone = 'ok',
		progress,
		progressTone = 'accent',
		footnote,
		corner,
		children
	}: {
		label: string;
		value: string;
		sub?: string;
		icon?: LucideIcon;
		delta?: string;
		deltaTone?: Tone;
		progress?: number;
		progressTone?: Tone;
		footnote?: string;
		corner?: Snippet;
		children?: Snippet;
	} = $props();

	const progressClass = $derived(
		progressTone === 'ok'
			? 'meter-fill meter-ok'
			: progressTone === 'danger'
				? 'meter-fill !bg-red-400'
				: progressTone === 'warn'
					? 'meter-fill !bg-amber-400'
					: 'meter-fill'
	);
</script>

<div class="panel group relative overflow-hidden p-4">
	<div class="flex items-start justify-between gap-3">
		<p class="mono-label">{label}</p>
		{#if Icon}
			<span class="text-[#6f6f7b] transition-colors group-hover:text-[#a0a0ab]">
				<Icon size={14} strokeWidth={1.7} />
			</span>
		{:else if corner}
			{@render corner()}
		{/if}
	</div>
	<div class="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
		<p class="font-display text-[clamp(19px,1.55vw,27px)] font-semibold leading-none tracking-[-0.02em] text-[#f1f1f6]">{value}</p>
		{#if delta}
			<span
				class="inline-flex items-center gap-0.5 font-code text-[10px] {deltaTone === 'danger'
					? 'text-red-300'
					: deltaTone === 'warn'
						? 'text-amber-300'
						: 'text-emerald-300'}"
			>
				{#if delta.startsWith('-')}
					<ArrowDownRight size={11} />
				{:else}
					<ArrowUpRight size={11} />
				{/if}
				{delta}
			</span>
		{/if}
	</div>
	{#if sub}
		<p class="mt-1.5 text-[11.5px] leading-snug text-[#8f8f9b]">{sub}</p>
	{/if}
	{#if progress !== undefined}
		<div class="mt-3 meter" aria-hidden="true">
			<div class={progressClass} style={`width:${Math.max(2, Math.min(100, progress))}%`}></div>
		</div>
	{/if}
	{#if children}
		<div class="mt-3">{@render children()}</div>
	{/if}
	{#if footnote}
		<p class="mt-2 font-code text-[9.5px] uppercase tracking-[0.08em] text-[#6f6f7b]">{footnote}</p>
	{/if}
</div>

<script lang="ts">
	import { CalendarDays, Cpu, Heart, Moon, Music, Presentation, Rocket, Users, Wrench } from '@lucide/svelte';
	import type { LucideIcon } from '@lucide/svelte';

	let {
		from = '#1b2a4a',
		to = '#43318a',
		icon = 'cpu',
		label,
		compact = false,
		class: className = ''
	}: {
		from?: string;
		to?: string;
		icon?: string;
		label?: string;
		compact?: boolean;
		class?: string;
	} = $props();

	const icons: Record<string, LucideIcon> = {
		cpu: Cpu,
		music: Music,
		presentation: Presentation,
		users: Users,
		'moon-star': Moon,
		moon: Moon,
		wrench: Wrench,
		rocket: Rocket,
		heart: Heart,
		calendar: CalendarDays
	};
	const Icon = $derived(icons[icon] ?? CalendarDays);
</script>

<div
	class="relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 {className}"
	class:h-10={compact}
	class:w-10={compact}
	class:h-16={!compact}
	class:w-24={!compact}
	style={`background:linear-gradient(135deg, ${from} 0%, ${to} 100%)`}
	aria-hidden="true"
>
	<div
		class="absolute inset-0 opacity-[0.16]"
		style="background-image:radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35) 0, transparent 45%), linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px);background-size:100% 100%, 10px 10px, 10px 10px;"
	></div>
	<Icon size={compact ? 15 : 22} strokeWidth={1.4} class="relative text-white/80" />
	{#if label}
		<span class="absolute bottom-1 left-1.5 font-code text-[7px] uppercase tracking-[0.14em] text-white/60">{label}</span>
	{/if}
</div>

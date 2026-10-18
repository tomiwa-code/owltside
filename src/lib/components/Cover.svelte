<script lang="ts">
	import type { CoverArt } from '$lib/types';
	import { coverIcons } from './iconMap';

	let { cover, class: cls = '', iconClass = 'w-10 h-10 text-white/40' }: {
		cover: CoverArt;
		class?: string;
		iconClass?: string;
	} = $props();

	let imageFailed = $state(false);
	$effect(() => { imageFailed = false; });
	const Icon = $derived(coverIcons[cover.icon] ?? coverIcons.music);
	// If the caller already positions the cover (e.g. `absolute inset-0` for
	// a full-bleed card hero), don't also force `relative` — Tailwind's
	// generated `relative` utility sorts after `absolute`, so `relative`
	// would win and the cover would collapse instead of filling its
	// positioned parent. See ExploreCard (mobile) and DesktopHomeFeed.
	const isPositioned = $derived(cls.includes('absolute') || cls.includes('fixed'));
</script>

<div
	class="{isPositioned ? '' : 'relative'} overflow-hidden {cls}"
	style="background: linear-gradient(135deg, {cover.from} 0%, {cover.to} 100%);"
	aria-hidden="true"
>
	{#if cover.src && !imageFailed}
		<img src={cover.src} alt="" onerror={() => (imageFailed = true)} class="absolute inset-0 w-full h-full object-cover" />
	{:else}
	<div
		class="absolute inset-0 opacity-40"
		style="background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0, transparent 42%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.10) 0, transparent 46%);"
	></div>
	<div class="absolute inset-0 flex items-center justify-center">
		<Icon class={iconClass} stroke-width="1.25" />
	</div>
	{/if}
</div>

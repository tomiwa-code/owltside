<script lang="ts">
	import type { CoverArt } from '$lib/types';
	import { coverIcons } from './iconMap';

	let { cover, class: cls = '', iconClass = 'w-10 h-10 text-white/40' }: {
		cover: CoverArt;
		class?: string;
		iconClass?: string;
	} = $props();

	const Icon = $derived(coverIcons[cover.icon] ?? coverIcons.music);
</script>

<div
	class="relative overflow-hidden {cls}"
	style="background: linear-gradient(135deg, {cover.from} 0%, {cover.to} 100%);"
	aria-hidden="true"
>
	<div
		class="absolute inset-0 opacity-40"
		style="background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0, transparent 42%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.10) 0, transparent 46%);"
	></div>
	<div class="absolute inset-0 flex items-center justify-center">
		<Icon class={iconClass} stroke-width="1.25" />
	</div>
</div>

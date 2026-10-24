<script lang="ts">
	import { onMount } from 'svelte';

	let { payload, size = 190 }: { payload: string; size?: number } = $props();

	let dataUrl = $state<string | null>(null);

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				const mod = await import('qrcode');
				const url = await mod.default.toDataURL(payload, {
					errorCorrectionLevel: 'M',
					margin: 1,
					width: 360,
					color: { dark: '#0f0f13', light: '#ffffff' }
				});
				if (!cancelled) dataUrl = url;
			} catch {
				/* Fall back to the deterministic placeholder below. */
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	const modules = 25;
	const grid = $derived.by(() => {
		let seed = 0;
		for (const char of payload) seed = (seed * 33 + char.charCodeAt(0)) >>> 0;
		const cells: { x: number; y: number }[] = [];
		for (let y = 0; y < modules; y++) {
			for (let x = 0; x < modules; x++) {
				const finder =
					(x < 7 && y < 7) || (x > modules - 8 && y < 7) || (x < 7 && y > modules - 8);
				if (finder) continue;
				seed = (seed * 1664525 + 1013904223) >>> 0;
				if ((seed >>> 16) % 100 < 46) cells.push({ x, y });
			}
		}
		return cells;
	});
</script>

<div class="flex flex-col items-center">
	{#if dataUrl}
		<img src={dataUrl} alt="Attendee pass QR code" class="rounded-md border border-[#2a2a32]" style={`width:${size}px;height:${size}px`} />
	{:else}
		<svg viewBox="0 0 {modules} {modules}" width={size} height={size} class="rounded-md border border-[#2a2a32] bg-white p-1.5" role="img" aria-label="Ticket QR preview">
			<rect width={modules} height={modules} fill="#ffffff" />
			{#each grid as cell}
				<rect x={cell.x} y={cell.y} width="1" height="1" fill="#111118" />
			{/each}
			{#each [[0, 0], [modules - 7, 0], [0, modules - 7]] as [fx, fy]}
				<rect x={fx} y={fy} width="7" height="7" fill="#111118" />
				<rect x={fx + 1} y={fy + 1} width="5" height="5" fill="#ffffff" />
				<rect x={fx + 2} y={fy + 2} width="3" height="3" fill="#111118" />
			{/each}
		</svg>
	{/if}
	<p class="mt-2 font-code text-[7.5px] uppercase tracking-[0.16em] text-[#6f6f7b]">
		Signed pass · Owltside
	</p>
</div>

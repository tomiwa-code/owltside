<script lang="ts">
	import { Image as ImageIcon, RotateCcw, X } from '@lucide/svelte';
	import {
		drawCrop,
		coverCropRect,
		imageAspect,
		outputSizeFor,
		loadImageSource,
		renderCropToDataUrl,
		type ImageSource
	} from '$lib/utils/image';
	import { toast } from '$lib/state/toast.svelte';

	/**
	 * Resize/crop step that runs *before* an upload is applied: an image is only
	 * committed once the user confirms it here.
	 */
	let {
		open,
		file,
		title = 'Resize & crop',
		aspect = 'auto',
		round = false,
		maxDimension = 1440,
		maxZoom = 3,
		confirmLabel = 'Use image',
		hint = 'Drag the sliders to resize and crop. Nothing is saved until you confirm.',
		confirm,
		close
	}: {
		open: boolean;
		file: File | null;
		title?: string;
		/** Frame ratio (width / height) or 'auto' to keep the image's own shape. */
		aspect?: number | 'auto';
		round?: boolean;
		maxDimension?: number;
		maxZoom?: number;
		confirmLabel?: string;
		hint?: string;
		confirm: (dataUrl: string) => void;
		close: () => void;
	} = $props();

	let preview = $state<HTMLCanvasElement | null>(null);
	let source = $state<{ source: ImageSource; width: number; height: number } | null>(null);
	let release: (() => void) | null = null;
	let loading = $state(false);
	let error = $state('');
	let zoom = $state(1);
	let offsetX = $state(50);
	let offsetY = $state(50);
	let loadToken = 0;

	const frameAspect = $derived(aspect === 'auto' ? source ? imageAspect(source) : 1 : aspect);
	const rect = $derived(
		source
			? coverCropRect(source.width, source.height, { aspect: frameAspect, zoom, offsetX, offsetY })
			: null
	);
	const slackX = $derived(source && rect ? source.width - rect.sw : 0);
	const slackY = $derived(source && rect ? source.height - rect.sh : 0);
	const zoomedIn = $derived(zoom > 1.001);
	const adjusted = $derived(zoomedIn || Math.abs(offsetX - 50) > 0.5 || Math.abs(offsetY - 50) > 0.5);
	const output = $derived(rect ? outputSizeFor(rect.sw, rect.sh, maxDimension) : null);

	function reset() {
		zoom = 1;
		offsetX = 50;
		offsetY = 50;
	}

	function teardown() {
		release?.();
		release = null;
		source = null;
	}

	// Escape backs out of the crop step without touching the parent sheet/dialog.
	$effect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			close();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	// Decode the selected file when the step opens with a new file; the decoded
	// image is released when the step closes or another file is picked.
	$effect(() => {
		const target = file;
		if (!open || !target) return;
		const token = ++loadToken;
		loading = true;
		error = '';
		reset();
		loadImageSource(target)
			.then((loaded) => {
				if (token !== loadToken) {
					loaded.release();
					return;
				}
				release = loaded.release;
				source = { source: loaded.source, width: loaded.width, height: loaded.height };
			})
			.catch(() => {
				if (token === loadToken) error = 'This image could not be read. Try another file.';
			})
			.finally(() => {
				if (token === loadToken) loading = false;
			});

		return () => {
			if (token !== loadToken) return; // a newer file already owns the preview
			loadToken += 1;
			teardown();
		};
	});

	// Redraw the preview with exactly the maths used when saving.
	$effect(() => {
		const canvas = preview;
		const current = source;
		const crop = rect;
		const size = output;
		if (!canvas || !current || !crop || !size) return;
		canvas.width = Math.min(720, Math.max(240, Math.round(frameAspect >= 1 ? 720 : 480 * frameAspect)));
		canvas.height = Math.max(1, Math.round(canvas.width / frameAspect));
		const context = canvas.getContext('2d');
		if (!context) return;
		drawCrop(context, current.source, crop, { width: canvas.width, height: canvas.height });
	});

	function save() {
		const current = source;
		if (!current) return;
		try {
			const dataUrl = renderCropToDataUrl(current.source, {
				imageWidth: current.width,
				imageHeight: current.height,
				aspect: frameAspect,
				zoom,
				offsetX,
				offsetY,
				maxDimension
			});
			confirm(dataUrl);
		} catch {
			toast('This image could not be resized on your device.', 'error');
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title}>
		<button class="absolute inset-0 bg-[rgba(11,17,32,0.88)] backdrop-blur-[8px]" onclick={close} aria-label="Close"></button>
		<div
			class="absolute bottom-0 inset-x-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg
				max-h-[92dvh] flex flex-col rounded-t-2xl bg-surface-container border-t border-x border-surface-glass-border shadow-2xl"
		>
			<div class="flex justify-center pt-3 pb-1 shrink-0">
				<div class="w-9 h-1 rounded-full bg-surface-container-highest"></div>
			</div>
			<div class="px-5 py-2 flex items-center justify-between shrink-0">
				<h2 class="font-display text-headline-md text-on-surface">{title}</h2>
				<button aria-label="Close crop step" class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high" onclick={close}>
					<X class="w-5 h-5" />
				</button>
			</div>

			<div class="overflow-y-auto px-5 pb-4 flex-1 min-h-0 flex flex-col gap-4">
				<p class="text-body-sm text-on-surface-variant">{hint}</p>

				<div
					class="relative mx-auto overflow-hidden bg-surface-base border border-surface-glass-border {round ? 'rounded-full' : 'rounded-xl w-full'}"
					style="width: {round ? '176px' : '100%'}; aspect-ratio: {frameAspect};"
				>
					{#if loading}
						<div class="absolute inset-0 flex items-center justify-center text-body-sm text-on-surface-variant">Reading image…</div>
					{:else if error}
						<div class="absolute inset-0 flex items-center justify-center text-body-sm text-error px-4 text-center">{error}</div>
					{:else if source}
						<canvas bind:this={preview} class="w-full h-full block" aria-label="Crop preview"></canvas>
					{:else}
						<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
							<ImageIcon class="w-6 h-6" />
							<span class="text-xs">No image selected</span>
						</div>
					{/if}
				</div>

				{#if output}
					<p class="text-xs text-on-surface-variant text-center">
						Saved as {output.width} × {output.height}px JPEG{#if zoomedIn} • zoomed {zoom.toFixed(2)}×{/if}
					</p>
				{/if}

				<div class="flex flex-col gap-3">
					<label class="text-body-sm text-on-surface-variant flex flex-col gap-1.5">
						<span class="flex items-center justify-between"><span>Zoom / resize</span><span class="font-mono text-xs text-on-surface">{zoom.toFixed(2)}×</span></span>
						<input type="range" min="1" max={maxZoom} step="0.05" bind:value={zoom} disabled={!source} class="accent-primary" aria-label="Zoom and resize" />
					</label>
					<label class="text-body-sm text-on-surface-variant flex flex-col gap-1.5 {slackX < 1 ? 'opacity-50' : ''}">
						<span>Horizontal crop</span>
						<input type="range" min="0" max="100" step="1" bind:value={offsetX} disabled={!source || slackX < 1} class="accent-primary" aria-label="Horizontal crop" />
					</label>
					<label class="text-body-sm text-on-surface-variant flex flex-col gap-1.5 {slackY < 1 ? 'opacity-50' : ''}">
						<span>Vertical crop</span>
						<input type="range" min="0" max="100" step="1" bind:value={offsetY} disabled={!source || slackY < 1} class="accent-primary" aria-label="Vertical crop" />
					</label>
					<button
						type="button"
						class="self-start inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline disabled:opacity-40 disabled:no-underline"
						disabled={!source || !adjusted}
						onclick={reset}
					>
						<RotateCcw class="w-3.5 h-3.5" /> Reset to original
					</button>
				</div>
			</div>

			<div class="p-4 pb-safe border-t border-surface-glass-border bg-surface-container shrink-0 flex gap-2">
				<button type="button" class="flex-1 h-11 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface font-semibold" onclick={close}>Cancel</button>
				<button
					type="button"
					class="flex-1 h-11 rounded-full bg-primary text-on-primary font-semibold hover:opacity-90 disabled:opacity-50"
					disabled={!source || loading}
					onclick={save}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

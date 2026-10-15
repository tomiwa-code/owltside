<script lang="ts">
	import { Image as ImageIcon, Move, RotateCcw, X, ZoomIn } from '@lucide/svelte';
	import {
		drawCrop,
		coverCropRect,
		imageAspect,
		outputSizeFor,
		loadImageSource,
		renderCropToDataUrl,
		type ImageSource
	} from '$lib/utils/image';
	import {
		panBy,
		pinchDistance,
		pinchFactor,
		wheelFactor,
		zoomAt,
		type CropTarget
	} from '$lib/utils/crop-gestures';
	import { toast } from '$lib/state/toast.svelte';

	/**
	 * Resize/crop step that runs *before* an upload is applied: pinch to zoom,
	 * drag to reposition, and the image is only committed once the user confirms.
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
		hint = 'Pinch to zoom, drag to fit, then confirm. Nothing is saved until you confirm.',
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
	let frame = $state<HTMLDivElement | null>(null);
	let source = $state<{ source: ImageSource; width: number; height: number } | null>(null);
	let release: (() => void) | null = null;
	let loading = $state(false);
	let error = $state('');
	let interacting = $state(false);
	let zoom = $state(1);
	let offsetX = $state(50);
	let offsetY = $state(50);
	let loadToken = 0;

	// gestures are transient pointer bookkeeping, so plain state (no re-render churn)
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchReference = 0;

	const frameAspect = $derived(aspect === 'auto' ? source ? imageAspect(source) : 1 : aspect);
	const rect = $derived(
		source
			? coverCropRect(source.width, source.height, { aspect: frameAspect, zoom, offsetX, offsetY })
			: null
	);
	const view = $derived({ zoom, offsetX, offsetY });

	/** Measured at gesture time so a rotation/resize never leaves stale numbers behind. */
	function cropTarget(): CropTarget | null {
		const current = source;
		const element = frame;
		if (!current || !element) return null;
		const box = element.getBoundingClientRect();
		const frameWidth = element.clientWidth || box.width;
		const frameHeight = element.clientHeight || box.height;
		if (!frameWidth || !frameHeight) return null;
		return {
			imageWidth: current.width,
			imageHeight: current.height,
			aspect: frameAspect,
			maxZoom,
			frameWidth,
			frameHeight
		};
	}
	const slackX = $derived(source && rect ? source.width - rect.sw : 0);
	const slackY = $derived(source && rect ? source.height - rect.sh : 0);
	const zoomedIn = $derived(zoom > 1.001);
	const canPan = $derived(slackX > 0.5 || slackY > 0.5);
	const adjusted = $derived(zoomedIn || Math.abs(offsetX - 50) > 0.5 || Math.abs(offsetY - 50) > 0.5);
	const output = $derived(rect ? outputSizeFor(rect.sw, rect.sh, maxDimension) : null);

	function apply(next: { zoom: number; offsetX: number; offsetY: number }) {
		zoom = next.zoom;
		offsetX = next.offsetX;
		offsetY = next.offsetY;
	}

	function reset() {
		zoom = 1;
		offsetX = 50;
		offsetY = 50;
	}

	function teardown() {
		release?.();
		release = null;
		source = null;
		pointers.clear();
		pinchReference = 0;
		interacting = false;
	}

	// --- gestures -------------------------------------------------------------

	const focalPoint = (clientX: number, clientY: number) => {
		const box = frame?.getBoundingClientRect();
		if (!box || !box.width || !box.height) return { x: 0.5, y: 0.5 };
		return {
			x: (clientX - box.left) / box.width,
			y: (clientY - box.top) / box.height
		};
	};

	function onPointerDown(event: PointerEvent) {
		if (!source || !cropTarget()) return;
		event.preventDefault();
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		// a second finger starts a pinch: remember the grip so the first move
		// scales from where the fingers actually landed
		if (pointers.size >= 2) {
			const [first, second] = [...pointers.values()];
			pinchReference = pinchDistance(first, second);
		} else {
			pinchReference = 0;
		}
		interacting = true;
		try {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		} catch {
			/* capture is best-effort */
		}
	}

	function onPointerMove(event: PointerEvent) {
		const tracked = pointers.get(event.pointerId);
		const target = cropTarget();
		if (!tracked || !target) return;
		event.preventDefault();
		const previous = { ...tracked };
		tracked.x = event.clientX;
		tracked.y = event.clientY;

		if (pointers.size >= 2) {
			const [first, second] = [...pointers.values()];
			const distance = pinchDistance(first, second);
			if (pinchReference > 0) {
				const focal = focalPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
				apply(zoomAt(view, target, pinchFactor(pinchReference, distance), focal.x, focal.y));
			}
			pinchReference = distance;
			return;
		}

		apply(panBy(view, target, tracked.x - previous.x, tracked.y - previous.y));
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		pinchReference = 0;
		interacting = pointers.size > 0;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			/* pointer already released */
		}
	}

	function onWheel(event: WheelEvent) {
		const target = cropTarget();
		if (!target) return;
		event.preventDefault();
		const focal = focalPoint(event.clientX, event.clientY);
		apply(zoomAt(view, target, wheelFactor(event.deltaY), focal.x, focal.y));
	}

	function onKeyDown(event: KeyboardEvent) {
		const target = cropTarget();
		if (!target) return;
		const step = event.shiftKey ? 40 : 12;
		const keys: Record<string, () => void> = {
			ArrowLeft: () => apply(panBy(view, target, -step, 0)),
			ArrowRight: () => apply(panBy(view, target, step, 0)),
			ArrowUp: () => apply(panBy(view, target, 0, -step)),
			ArrowDown: () => apply(panBy(view, target, 0, step)),
			'+': () => apply(zoomAt(view, target, 1.1, 0.5, 0.5)),
			'=': () => apply(zoomAt(view, target, 1.1, 0.5, 0.5)),
			'-': () => apply(zoomAt(view, target, 1 / 1.1, 0.5, 0.5))
		};
		const action = keys[event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}

	// wheel needs a non-passive listener so it can zoom instead of scrolling the sheet
	$effect(() => {
		const element = frame;
		if (!element) return;
		const handler = (event: WheelEvent) => onWheel(event);
		element.addEventListener('wheel', handler, { passive: false });
		return () => element.removeEventListener('wheel', handler);
	});

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
		const selected = file;
		if (!open || !selected) return;
		const token = ++loadToken;
		loading = true;
		error = '';
		reset();
		loadImageSource(selected)
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

				<!-- Gesture surface: a custom pan/zoom widget (pinch, drag, wheel and
				     arrow-key nudges), so it is focusable and carries its own listeners. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					bind:this={frame}
					class="relative mx-auto overflow-hidden bg-surface-base border border-surface-glass-border select-none touch-none {round ? 'rounded-full' : 'rounded-xl w-full'} {source ? (canPan ? 'cursor-grab' : 'cursor-default') : ''} {interacting ? 'cursor-grabbing' : ''}"
					style="width: {round ? '176px' : '100%'}; aspect-ratio: {frameAspect};"
					role="application"
					aria-label="Crop preview — pinch to zoom, drag to reposition, arrow keys to move, plus and minus to zoom"
					tabindex="0"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointercancel={onPointerUp}
					onkeydown={onKeyDown}
				>
					{#if loading}
						<div class="absolute inset-0 flex items-center justify-center text-body-sm text-on-surface-variant">Reading image…</div>
					{:else if error}
						<div class="absolute inset-0 flex items-center justify-center text-body-sm text-error px-4 text-center">{error}</div>
					{:else if source}
						<canvas bind:this={preview} class="w-full h-full block pointer-events-none" aria-hidden="true"></canvas>
						{#if !interacting}
							<span class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-[rgba(11,17,32,0.72)] backdrop-blur-sm px-3 py-1.5 text-label-badge text-on-surface whitespace-nowrap">
								<ZoomIn class="w-3.5 h-3.5" /> Pinch to zoom{#if canPan}<span class="opacity-70">•</span><Move class="w-3.5 h-3.5" /> Drag to fit{/if}
							</span>
						{/if}
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

				<button
					type="button"
					class="self-center inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline disabled:opacity-40 disabled:no-underline"
					disabled={!source || !adjusted}
					onclick={reset}
				>
					<RotateCcw class="w-3.5 h-3.5" /> Reset to original
				</button>
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

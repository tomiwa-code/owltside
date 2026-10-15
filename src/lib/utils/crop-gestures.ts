/**
 * Gesture maths for the upload crop step: drag to reposition, pinch/wheel to
 * zoom. Kept pure so the pointer plumbing in the component stays thin and the
 * behaviour can be tested without a real touch screen.
 */
import { coverCropRect } from './image';

export interface CropView {
	zoom: number;
	/** Crop window position within the slack, 0-100 (like CSS object-position). */
	offsetX: number;
	offsetY: number;
}

export interface CropTarget {
	imageWidth: number;
	imageHeight: number;
	/** Frame ratio (width / height); defaults to the image's own ratio. */
	aspect?: number;
	maxZoom: number;
	/** On-screen size of the frame, in CSS pixels. */
	frameWidth: number;
	frameHeight: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const clampZoom = (zoom: number, maxZoom: number) => clamp(zoom, 1, Math.max(1, maxZoom));

const rectFor = (view: CropView, target: CropTarget) =>
	coverCropRect(target.imageWidth, target.imageHeight, {
		aspect: target.aspect,
		zoom: view.zoom,
		offsetX: view.offsetX,
		offsetY: view.offsetY
	});

/** Drag the image by a screen-pixel delta: the picture follows the finger. */
export function panBy(
	view: CropView,
	target: CropTarget,
	dxDisplay: number,
	dyDisplay: number
): CropView {
	if (!target.frameWidth || !target.frameHeight) return view;
	const rect = rectFor(view, target);
	const dxImage = dxDisplay * (rect.sw / target.frameWidth);
	const dyImage = dyDisplay * (rect.sh / target.frameHeight);
	const slackX = target.imageWidth - rect.sw;
	const slackY = target.imageHeight - rect.sh;

	return {
		zoom: view.zoom,
		offsetX: slackX > 0.5 ? clamp(view.offsetX - (dxImage / slackX) * 100, 0, 100) : view.offsetX,
		offsetY: slackY > 0.5 ? clamp(view.offsetY - (dyImage / slackY) * 100, 0, 100) : view.offsetY
	};
}

/**
 * Scale by `factor` (pinch in/out or wheel) while keeping the image point under
 * the focal spot exactly where it is — `focalX`/`focalY` are fractions (0-1) of
 * the frame, so the zoom grows out of the pinch midpoint.
 */
export function zoomAt(
	view: CropView,
	target: CropTarget,
	factor: number,
	focalX: number,
	focalY: number
): CropView {
	const nextZoom = clampZoom(view.zoom * factor, target.maxZoom);
	if (nextZoom === view.zoom) return view;

	const before = rectFor(view, target);
	// which image pixel currently sits under the pinch/pinch midpoint
	const anchorX = before.sx + clamp(focalX, 0, 1) * before.sw;
	const anchorY = before.sy + clamp(focalY, 0, 1) * before.sh;

	const next = coverCropRect(target.imageWidth, target.imageHeight, {
		aspect: target.aspect,
		zoom: nextZoom,
		offsetX: view.offsetX,
		offsetY: view.offsetY
	});
	const slackX = target.imageWidth - next.sw;
	const slackY = target.imageHeight - next.sh;

	return {
		zoom: nextZoom,
		offsetX:
			slackX > 0.5
				? clamp(((anchorX - clamp(focalX, 0, 1) * next.sw) / slackX) * 100, 0, 100)
				: view.offsetX,
		offsetY:
			slackY > 0.5
				? clamp(((anchorY - clamp(focalY, 0, 1) * next.sh) / slackY) * 100, 0, 100)
				: view.offsetY
	};
}

/** Distance between two grip points — the pinch scale reference. */
export function pinchDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Scale factor for a pinch that went from `previous` to `next` pixels apart. */
export function pinchFactor(previous: number, next: number): number {
	if (!(previous > 0) || !Number.isFinite(next)) return 1;
	return next / previous;
}

/** Wheel/trackpad scroll to zoom factor (negative deltaY zooms in). */
export function wheelFactor(deltaY: number, sensitivity = 0.0015): number {
	return Math.exp(-deltaY * sensitivity);
}

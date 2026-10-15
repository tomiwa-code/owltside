import { describe, expect, it } from 'vitest';
import { coverCropRect } from './image';
import { panBy, pinchDistance, pinchFactor, wheelFactor, zoomAt, type CropTarget } from './crop-gestures';

const target: CropTarget = {
	imageWidth: 800,
	imageHeight: 600,
	aspect: 1,
	maxZoom: 3,
	frameWidth: 352,
	frameHeight: 352
};

const at = (view: { zoom: number; offsetX: number; offsetY: number }) =>
	coverCropRect(target.imageWidth, target.imageHeight, { aspect: target.aspect, ...view });

describe('pinchDistance / pinchFactor / wheelFactor', () => {
	it('measures the gap between two fingers', () => {
		expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});

	it('turns finger travel into a scale factor', () => {
		expect(pinchFactor(100, 200)).toBe(2); // pinch out → zoom in
		expect(pinchFactor(200, 100)).toBe(0.5); // pinch in → zoom out
		expect(pinchFactor(0, 100)).toBe(1); // degenerate grip is ignored
	});

	it('maps wheel scroll to zoom (up = in)', () => {
		expect(wheelFactor(-100)).toBeGreaterThan(1);
		expect(wheelFactor(100)).toBeLessThan(1);
		expect(wheelFactor(0)).toBe(1);
	});
});

describe('pinch to zoom', () => {
	it('zooms in when fingers spread and out when they pinch together', () => {
		const start = { zoom: 1, offsetX: 50, offsetY: 50 };
		const zoomedIn = zoomAt(start, target, pinchFactor(100, 180), 0.5, 0.5);
		expect(zoomedIn.zoom).toBeCloseTo(1.8, 5);

		const zoomedOut = zoomAt(zoomedIn, target, pinchFactor(180, 120), 0.5, 0.5);
		expect(zoomedOut.zoom).toBeCloseTo(1.2, 5);
	});

	it('never zooms past the limits', () => {
		expect(zoomAt({ zoom: 1, offsetX: 50, offsetY: 50 }, target, 0.2, 0.5, 0.5).zoom).toBe(1);
		expect(zoomAt({ zoom: 2.9, offsetX: 50, offsetY: 50 }, target, 4, 0.5, 0.5).zoom).toBe(3);
	});

	it('keeps the image point under the pinch midpoint in place', () => {
		const start = { zoom: 1, offsetX: 50, offsetY: 50 };
		const focal = { x: 0.25, y: 0.8 };
		const before = at(start);

		const zoomed = zoomAt(start, target, 2.2, focal.x, focal.y);
		const after = at(zoomed);

		// the image pixel that sat under the pinch point is unchanged
		expect(after.sx + focal.x * after.sw).toBeCloseTo(before.sx + focal.x * before.sw, 5);
		expect(after.sy + focal.y * after.sh).toBeCloseTo(before.sy + focal.y * before.sh, 5);
	});

	it('pulls the crop toward the pinch corner when zooming near an edge', () => {
		const zoomed = zoomAt({ zoom: 1, offsetX: 50, offsetY: 50 }, target, 2, 0.9, 0.5);
		// pinching the right edge zooms into the right side of the picture
		expect(zoomed.offsetX).toBeGreaterThan(50);
		expect(zoomed.offsetY).toBeCloseTo(50, 5);
	});

	it('is a no-op when the factor changes nothing', () => {
		const view = { zoom: 1, offsetX: 50, offsetY: 50 };
		expect(zoomAt(view, target, 1, 0.3, 0.7)).toBe(view);
	});
});

describe('drag to fit', () => {
	it('moves the picture with the finger', () => {
		// dragging right reveals the left of the image → crop offset moves left
		const dragged = panBy({ zoom: 1, offsetX: 50, offsetY: 50 }, target, 40, 0);
		expect(dragged.offsetX).toBeLessThan(50);
		expect(dragged.offsetY).toBe(50);
		// 40 screen px at a 352px frame showing a 600px crop = 68 image px of 200 slack
		expect(dragged.offsetX).toBeCloseTo(50 - ((40 * (600 / 352)) / 200) * 100, 5);
	});

	it('drags vertically only when there is vertical slack', () => {
		// a square crop of an 800×600 image already uses the full height
		const noSlack = panBy({ zoom: 1, offsetX: 50, offsetY: 50 }, target, 0, -60);
		expect(noSlack.offsetY).toBe(50);

		// dragging up reveals the bottom of the picture
		const zoomed = panBy({ zoom: 2, offsetX: 50, offsetY: 50 }, target, 0, -60);
		expect(zoomed.offsetY).toBeGreaterThan(50);
	});

	it('clamps to the edges instead of leaving gaps', () => {
		const far = panBy({ zoom: 2, offsetX: 50, offsetY: 50 }, target, 5000, 5000);
		expect(far.offsetX).toBe(0);
		expect(far.offsetY).toBe(0);

		const other = panBy({ zoom: 2, offsetX: 50, offsetY: 50 }, target, -5000, -5000);
		expect(other.offsetX).toBe(100);
		expect(other.offsetY).toBe(100);
	});

	it('only pans along the axes that have slack', () => {
		// at zoom 1 a square frame on a landscape photo has horizontal slack but no vertical slack
		const dragged = panBy({ zoom: 1, offsetX: 50, offsetY: 50 }, target, 200, 200);
		expect(dragged.offsetX).toBe(0);
		expect(dragged.offsetY).toBe(50);
	});

	it('does nothing without a laid-out frame', () => {
		const view = { zoom: 1.5, offsetX: 30, offsetY: 70 };
		expect(panBy(view, { ...target, frameWidth: 0, frameHeight: 0 }, 40, 40)).toBe(view);
	});
});

describe('gesture sequences', () => {
	it('a pinch followed by a drag keeps the crop inside the image', () => {
		let view = { zoom: 1, offsetX: 50, offsetY: 50 };
		view = zoomAt(view, target, pinchFactor(100, 260), 0.4, 0.6);
		view = panBy(view, target, -120, 90);
		view = zoomAt(view, target, pinchFactor(260, 90), 0.5, 0.5);

		const rect = at(view);
		expect(rect.sx).toBeGreaterThanOrEqual(0);
		expect(rect.sy).toBeGreaterThanOrEqual(0);
		expect(rect.sx + rect.sw).toBeLessThanOrEqual(target.imageWidth + 0.0001);
		expect(rect.sy + rect.sh).toBeLessThanOrEqual(target.imageHeight + 0.0001);
		expect(view.zoom).toBeGreaterThanOrEqual(1);
		expect(view.zoom).toBeLessThanOrEqual(target.maxZoom);
	});

	it('keeps the frame ratio for a banner-shaped crop', () => {
		const banner: CropTarget = { ...target, aspect: 2.33 };
		const view = zoomAt({ zoom: 1, offsetX: 50, offsetY: 50 }, banner, 1.7, 0.5, 0.5);
		const rect = coverCropRect(banner.imageWidth, banner.imageHeight, {
			aspect: banner.aspect,
			...view
		});
		expect(rect.sw / rect.sh).toBeCloseTo(2.33, 3);
		expect(rect.sw).toBeLessThanOrEqual(banner.imageWidth);
	});
});

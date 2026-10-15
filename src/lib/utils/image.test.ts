import { describe, expect, it } from 'vitest';
import { coverCropRect, outputSizeFor } from './image';

describe('coverCropRect', () => {
	it('cover-fits a landscape photo into a square frame', () => {
		const rect = coverCropRect(4000, 3000, { aspect: 1 });
		expect(rect).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 });
	});

	it('keeps the whole image when the frame matches the image ratio', () => {
		expect(coverCropRect(1200, 800)).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 800 });
	});

	it('zooms in around the crop position instead of the centre', () => {
		const rect = coverCropRect(4000, 3000, { aspect: 1, zoom: 2 });
		expect(rect.sw).toBe(1500);
		expect(rect.sh).toBe(1500);
		// zoom 2 leaves 2500px of horizontal slack, centred by default
		expect(rect.sx).toBe(1250);
		expect(rect.sy).toBe(750);
	});

	it('maps the offsets across the available slack', () => {
		expect(coverCropRect(4000, 3000, { aspect: 1, zoom: 2, offsetX: 0 }).sx).toBe(0);
		expect(coverCropRect(4000, 3000, { aspect: 1, zoom: 2, offsetX: 100 }).sx).toBe(2500);
		expect(coverCropRect(4000, 3000, { aspect: 1, zoom: 2, offsetY: 0 }).sy).toBe(0);
		expect(coverCropRect(4000, 3000, { aspect: 1, zoom: 2, offsetY: 100 }).sy).toBe(1500);
	});

	it('cover-fits a portrait photo into a wide banner frame', () => {
		const rect = coverCropRect(1000, 2000, { aspect: 2.33 });
		expect(rect.sw).toBe(1000);
		expect(rect.sh).toBeCloseTo(1000 / 2.33, 5);
		expect(rect.sx).toBe(0);
		expect(rect.sy).toBeCloseTo((2000 - 1000 / 2.33) / 2, 5);
	});

	it('never escapes the image bounds', () => {
		for (const aspect of [0.5, 1, 1.6, 2.33]) {
			for (const zoom of [1, 1.35, 2, 3]) {
				for (const offset of [0, 25, 50, 75, 100]) {
					const rect = coverCropRect(3000, 1200, { aspect, zoom, offsetX: offset, offsetY: offset });
					expect(rect.sx).toBeGreaterThanOrEqual(0);
					expect(rect.sy).toBeGreaterThanOrEqual(0);
					expect(rect.sx + rect.sw).toBeLessThanOrEqual(3000.0001);
					expect(rect.sy + rect.sh).toBeLessThanOrEqual(1200.0001);
					expect(rect.sw / rect.sh).toBeCloseTo(aspect, 3);
				}
			}
		}
	});

	it('clamps a zoom below 1 the same as 1', () => {
		expect(coverCropRect(800, 600, { aspect: 1, zoom: 0.4 })).toEqual(coverCropRect(800, 600, { aspect: 1 }));
	});
});

describe('outputSizeFor', () => {
	it('caps the longest side at the max dimension', () => {
		expect(outputSizeFor(3000, 3000, 640)).toEqual({ width: 640, height: 640 });
		expect(outputSizeFor(6000, 4000, 1600)).toEqual({ width: 1600, height: 1067 });
	});

	it('never upscales a small crop', () => {
		expect(outputSizeFor(320, 180, 1440)).toEqual({ width: 320, height: 180 });
	});

	it('keeps at least one pixel', () => {
		expect(outputSizeFor(0.2, 0.4, 1440)).toEqual({ width: 1, height: 1 });
	});
});

// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { validateEventPoster } from './event-poster';

const image = async (width: number, height: number) => `data:image/png;base64,${(await sharp({ create: { width, height, channels: 3, background: '#abcdef' } }).png().toBuffer()).toString('base64')}`;
describe('required event poster validation', () => {
	it('requires an upload; external URLs and gradients cannot masquerade as posters', async () => {
		for (const value of [undefined, '', 'https://example.com/photo.jpg', { from: '#000' }])
			await expect(validateEventPoster(value)).rejects.toThrow();
	});
	it('rejects corrupt image bytes and SVG content', async () => {
		await expect(validateEventPoster('data:image/jpeg;base64,YmFk')).rejects.toThrow('could not be read');
		await expect(validateEventPoster('data:image/svg+xml;base64,PHN2Zz4=')).rejects.toThrow('valid JPEG');
	});
	it('rejects oversized input before decoding', async () => {
		await expect(validateEventPoster('x'.repeat(7_000_001))).rejects.toThrow('too large');
	});
	it('rejects images too small for a flyer', async () => {
		await expect(validateEventPoster(await image(100, 100))).rejects.toThrow('320 × 180');
	});
	it('normalizes real images to a bounded JPEG without placeholder artwork', async () => {
		const result = await validateEventPoster(await image(2000, 1200));
		expect(result).toMatch(/^data:image\/jpeg;base64,/);
		const metadata = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata();
		expect(metadata.width).toBe(1600); expect(metadata.height).toBe(900);
	});
});

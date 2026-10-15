/**
 * Image helpers for upload flows: an upload is only applied once the user has
 * resized/cropped it, so every call site shares the same cover-fit maths.
 */

export interface CropRect {
	/** Source rectangle in image pixels. */
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

export interface OutputSize {
	width: number;
	height: number;
}

export interface CropOptions {
	/** Frame aspect ratio (width / height). Defaults to the image's own ratio. */
	aspect?: number;
	/** 1 = cover fit, up to `maxZoom` = zoomed in. */
	zoom?: number;
	/** Crop window position within the slack, 0-100 (like CSS object-position). */
	offsetX?: number;
	offsetY?: number;
}

/** Any drawable source: ImageBitmap, <img> or <canvas>. */
export type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function imageAspect(source: { width: number; height: number }): number {
	return source.height > 0 ? source.width / source.height : 1;
}

/**
 * The part of an image (in pixels) that ends up inside a frame of `aspect`
 * once the image is cover-fitted, `zoom`-ed in and positioned by the offsets.
 * `zoom: 1` + offsets at 50 is the plain cover crop.
 */
export function coverCropRect(
	imageWidth: number,
	imageHeight: number,
	{ aspect, zoom = 1, offsetX = 50, offsetY = 50 }: CropOptions = {}
): CropRect {
	const width = Math.max(1, imageWidth);
	const height = Math.max(1, imageHeight);
	const ratio = aspect && aspect > 0 ? aspect : width / height;
	const safeZoom = Math.max(1, zoom);

	// largest frame of `ratio` that fits inside the image
	const fitWidth = Math.min(width, height * ratio);
	const fitHeight = fitWidth / ratio;

	const sw = clamp(fitWidth / safeZoom, 1, width);
	const sh = clamp(fitHeight / safeZoom, 1, height);
	const slackX = width - sw;
	const slackY = height - sh;

	return {
		sx: clamp(slackX * (offsetX / 100), 0, slackX),
		sy: clamp(slackY * (offsetY / 100), 0, slackY),
		sw,
		sh
	};
}

/** Pixel size of the saved image: the crop, capped so its longest side is `maxDimension`. */
export function outputSizeFor(
	cropWidth: number,
	cropHeight: number,
	maxDimension: number
): OutputSize {
	const longest = Math.max(cropWidth, cropHeight, 1);
	const scale = Math.min(1, Math.max(1, maxDimension) / longest);
	return {
		width: Math.max(1, Math.round(cropWidth * scale)),
		height: Math.max(1, Math.round(cropHeight * scale))
	};
}

/** Draw `rect` of `source` into `context`, scaled to `output`. */
export function drawCrop(
	context: CanvasRenderingContext2D,
	source: ImageSource,
	rect: CropRect,
	output: OutputSize
): void {
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.clearRect(0, 0, output.width, output.height);
	context.drawImage(
		source,
		rect.sx,
		rect.sy,
		rect.sw,
		rect.sh,
		0,
		0,
		output.width,
		output.height
	);
}

interface LoadedImage {
	source: ImageSource;
	width: number;
	height: number;
	release: () => void;
}

/** Decode a user-selected file, preferring `createImageBitmap` and falling back to an <img>. */
export async function loadImageSource(file: File): Promise<LoadedImage> {
	if (typeof createImageBitmap === 'function') {
		const bitmap = await createImageBitmap(file);
		return {
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			release: () => bitmap.close?.()
		};
	}
	const url = URL.createObjectURL(file);
	try {
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const element = new Image();
			element.onload = () => resolve(element);
			element.onerror = () => reject(new Error('This image could not be decoded.'));
			element.src = url;
		});
		return {
			source: image,
			width: image.naturalWidth || image.width,
			height: image.naturalHeight || image.height,
			release: () => URL.revokeObjectURL(url)
		};
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
}

export interface RenderCropOptions extends CropOptions {
	imageWidth: number;
	imageHeight: number;
	maxDimension: number;
	quality?: number;
}

/** Bake the crop/resize into a JPEG data URL — this is what gets saved. */
export function renderCropToDataUrl(source: ImageSource, options: RenderCropOptions): string {
	const rect = coverCropRect(options.imageWidth, options.imageHeight, options);
	const output = outputSizeFor(rect.sw, rect.sh, options.maxDimension);
	const canvas = document.createElement('canvas');
	canvas.width = output.width;
	canvas.height = output.height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Image canvas is unavailable');
	drawCrop(context, source, rect, output);
	return canvas.toDataURL('image/jpeg', options.quality ?? 0.85);
}

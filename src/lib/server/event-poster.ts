import sharp from 'sharp';

/** Decode rather than trusting a file name/MIME. Re-encode strips metadata and limits output. */
export async function validateEventPoster(input: unknown): Promise<string> {
	if (typeof input !== 'string' || !input) throw new Error('Upload and crop a flyer or poster before publishing.');
	if (input.length > 7_000_000) throw new Error('Poster is too large. Choose an image under 5 MB after cropping.');
	const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
	if (!match) throw new Error('Choose a valid JPEG, PNG, or WebP poster.');
	const buffer = Buffer.from(match[2], 'base64');
	if (buffer.length > 5_000_000) throw new Error('Poster must be under 5 MB after cropping.');
	try {
		const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' });
		const metadata = await image.metadata();
		if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('format');
		if ((metadata.width ?? 0) < 320 || (metadata.height ?? 0) < 180) throw new Error('small');
		const output = await image.rotate().resize(1600, 900, { fit: 'cover', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
		return `data:image/jpeg;base64,${output.toString('base64')}`;
	} catch (error) {
		if (error instanceof Error && error.message === 'small') throw new Error('Use a poster at least 320 × 180 pixels.');
		throw new Error('This poster could not be read. Try a different JPEG, PNG, or WebP image.');
	}
}

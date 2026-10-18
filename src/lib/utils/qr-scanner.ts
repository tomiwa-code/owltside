import jsQR from 'jsqr';

/**
 * Phone camera plumbing for the gate scanner.
 *
 * Two things matter on a real phone:
 *  1. `getUserMedia` only exists in a secure context (https or localhost) and
 *     is refused inside cross-origin preview frames, so the scanner has to say
 *     what is wrong instead of silently showing a black box.
 *  2. Only Chromium exposes the native `BarcodeDetector`. iOS Safari and
 *     Firefox need a software decoder, otherwise the camera opens but never
 *     reads a ticket.
 */

export type CameraIssue =
	| 'no-api'
	| 'insecure'
	| 'embedded'
	| 'denied'
	| 'no-camera'
	| 'failed';

export class CameraError extends Error {
	readonly issue: CameraIssue;
	constructor(issue: CameraIssue, message: string) {
		super(message);
		this.name = 'CameraError';
		this.issue = issue;
	}
}

export interface CameraAvailability {
	/** The browser exposes `navigator.mediaDevices.getUserMedia`. */
	hasApi: boolean;
	/** The page runs in a secure context (https or localhost). */
	secure: boolean;
	/** The page is rendered inside a frame; cameras need a top-level tab. */
	embedded: boolean;
	/** A camera can be opened right now. */
	ready: boolean;
	/** What to tell the organizer when it cannot. */
	message: string;
}

export function cameraAvailability(): CameraAvailability {
	const hasApi =
		typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
	const secure = typeof window === 'undefined' ? true : window.isSecureContext !== false;
	const embedded =
		typeof window !== 'undefined' && typeof window.top !== 'undefined' && window.self !== window.top;

	let message = '';
	if (!secure) {
		message =
			'The camera needs a secure connection. Open this page over https (or on localhost) and try again.';
	} else if (!hasApi) {
		message = 'This browser cannot open a camera. Use Safari or Chrome and allow camera access.';
	} else if (embedded) {
		// Frames can still be allowed the camera, so this is a warning and not
		// a hard block — the scanner offers its own tab as the safe path.
		message =
			'This page is running inside a preview frame. Open the scanner in its own tab to use the phone camera.';
	}

	return { hasApi, secure, embedded, ready: hasApi && secure, message };
}

/** Constraint sets tried in order: rear camera first, then any camera. */
const VIDEO_CONSTRAINTS: MediaStreamConstraints[] = [
	{
		video: {
			facingMode: { ideal: 'environment' },
			width: { ideal: 1280 },
			height: { ideal: 720 }
		},
		audio: false
	},
	{ video: { facingMode: 'environment' }, audio: false },
	{ video: true, audio: false }
];

function issueOf(error: unknown): CameraIssue {
	const name = (error as { name?: string })?.name ?? '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	// OverconstrainedError only means "this constraint set does not fit" —
	// the next, looser one may still work.
	if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-camera';
	return 'failed';
}

function messageFor(issue: CameraIssue): string {
	switch (issue) {
		case 'denied':
			return 'Camera access was blocked. Allow the camera for this site, then start it again.';
		case 'no-camera':
			return 'No camera was found on this device. Use the manual code box below.';
		case 'insecure':
			return 'The camera needs a secure connection. Open this page over https (or on localhost) and try again.';
		case 'embedded':
			return 'This page is running inside a preview frame. Open the scanner in its own tab to use the phone camera.';
		default:
			return 'The camera could not be started. Close other camera apps and try again.';
	}
}

/**
 * Opens the rear camera and attaches it to the given video element.
 * Throws a `CameraError` with a human-readable reason when it cannot.
 */
export async function openCameraStream(video: HTMLVideoElement): Promise<MediaStream> {
	const availability = cameraAvailability();
	if (!availability.secure) throw new CameraError('insecure', messageFor('insecure'));
	if (!availability.hasApi) throw new CameraError('no-api', messageFor('no-api'));

	for (const constraints of VIDEO_CONSTRAINTS) {
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia(constraints);
		} catch (error) {
			const issue = issueOf(error);
			// Permission and hardware problems are final; only try the next
			// constraint set when this one could not be satisfied.
			if (issue !== 'failed') throw new CameraError(issue, messageFor(issue));
			continue;
		}
		try {
			await attachStream(video, stream);
		} catch (error) {
			stopStream(stream);
			throw error instanceof CameraError
				? error
				: new CameraError('failed', messageFor('failed'));
		}
		return stream;
	}
	throw new CameraError('failed', messageFor('failed'));
}

/**
 * Plays the preview. A rejected `play()` is not fatal: the camera stream is
 * still live, the organizer just has to tap the preview once (iOS asks for a
 * gesture before it starts rendering).
 */
export async function startPreview(video: HTMLVideoElement): Promise<boolean> {
	try {
		await video.play();
		return true;
	} catch {
		return false;
	}
}

async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
	video.muted = true;
	video.playsInline = true;
	video.autoplay = true;
	video.srcObject = stream;
	try {
		await video.play();
	} catch {
		// Some browsers refuse the first play() call; one more attempt on the
		// next frame is usually enough.
		await new Promise((resolve) => {
			if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve(undefined));
			else setTimeout(() => resolve(undefined), 50);
		});
		await startPreview(video);
	}
}

export function stopStream(stream: MediaStream | null | undefined): void {
	stream?.getTracks?.().forEach((track) => track.stop());
}

export interface QrDetector {
	/** True when the browser's native BarcodeDetector does the work. */
	native: boolean;
	/** Reads one QR payload from the current video frame. */
	detect(video: HTMLVideoElement): Promise<string | null>;
	/** Releases the decoder resources. */
	close(): void;
}

/** Native detector when the browser has one, software decoder otherwise. */
export function createQrDetector(): QrDetector {
	const Detector = (globalThis as { BarcodeDetector?: new (options: { formats: string[] }) => unknown })
		.BarcodeDetector;
	if (typeof Detector === 'function') {
		try {
			const detector = new Detector({ formats: ['qr_code'] }) as {
				detect(source: CanvasImageSource): Promise<{ rawValue?: string }[]>;
			};
			return {
				native: true,
				async detect(video) {
					if (!video.videoWidth) return null;
					const codes = await detector.detect(video);
					return codes?.[0]?.rawValue ?? null;
				},
				close() {}
			};
		} catch {
			// The API exists but does not support QR codes here.
		}
	}
	return createSoftwareDetector();
}

function createSoftwareDetector(): QrDetector {
	let canvas: HTMLCanvasElement | undefined;
	let context: CanvasRenderingContext2D | undefined;
	return {
		native: false,
		async detect(video) {
			const width = video.videoWidth;
			const height = video.videoHeight;
			if (!width || !height) return null;
			if (!canvas) {
				canvas = document.createElement('canvas');
				context = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
			}
			if (!canvas || !context) return null;
			// Small frames decode fast enough on a phone and keep the QR sharp.
			const scale = Math.min(1, 480 / width);
			const targetWidth = Math.max(1, Math.round(width * scale));
			const targetHeight = Math.max(1, Math.round(height * scale));
			if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
				canvas.width = targetWidth;
				canvas.height = targetHeight;
			}
			context.drawImage(video, 0, 0, targetWidth, targetHeight);
			const image = context.getImageData(0, 0, targetWidth, targetHeight);
			const result = jsQR(image.data, targetWidth, targetHeight, {
				inversionAttempts: 'attemptBoth'
			});
			return result?.data ?? null;
		},
		close() {
			canvas = undefined;
			context = undefined;
		}
	};
}

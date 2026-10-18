import { describe, expect, it, vi, afterEach } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
	CameraError,
	cameraAvailability,
	createQrDetector,
	openCameraStream,
	startPreview,
	stopStream
} from '$lib/utils/qr-scanner';

/** Renders a QR payload into an RGBA buffer the software decoder can read. */
function qrToImageData(payload: string, scale = 4, quiet = 4) {
	const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
	const size = qr.modules.size;
	const dimension = (size + quiet * 2) * scale;
	const data = new Uint8ClampedArray(dimension * dimension * 4).fill(255);
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (!qr.modules.data[row * size + col]) continue;
			for (let dy = 0; dy < scale; dy++) {
				for (let dx = 0; dx < scale; dx++) {
					const x = (col + quiet) * scale + dx;
					const y = (row + quiet) * scale + dy;
					const offset = (y * dimension + x) * 4;
					data[offset] = 0;
					data[offset + 1] = 0;
					data[offset + 2] = 0;
				}
			}
		}
	}
	return { data, dimension };
}

function fakeVideo() {
	return {
		muted: false,
		playsInline: false,
		autoplay: false,
		srcObject: null,
		play: vi.fn(async () => undefined)
	} as unknown as HTMLVideoElement;
}

function fakeStream() {
	return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

const originalMediaDevices = navigator.mediaDevices;

afterEach(() => {
	vi.unstubAllGlobals();
	Object.defineProperty(navigator, 'mediaDevices', {
		value: originalMediaDevices,
		configurable: true,
		writable: true
	});
});

describe('camera availability', () => {
	it('reports a missing camera API instead of failing silently', () => {
		Object.defineProperty(navigator, 'mediaDevices', {
			value: undefined,
			configurable: true,
			writable: true
		});
		const availability = cameraAvailability();
		expect(availability.hasApi).toBe(false);
		expect(availability.ready).toBe(false);
		expect(availability.message).toMatch(/cannot open a camera/i);
	});

	it('is ready when a camera API is exposed', () => {
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia: vi.fn() },
			configurable: true,
			writable: true
		});
		const availability = cameraAvailability();
		expect(availability.hasApi).toBe(true);
		expect(availability.ready).toBe(true);
		expect(availability.message).toBe('');
	});

	it('explains that a secure connection is required', async () => {
		Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia: vi.fn() },
			configurable: true,
			writable: true
		});
		const availability = cameraAvailability();
		expect(availability.secure).toBe(false);
		expect(availability.ready).toBe(false);
		expect(availability.message).toMatch(/secure connection/i);

		await expect(openCameraStream(fakeVideo())).rejects.toMatchObject({ issue: 'insecure' });
		Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
	});
});

describe('opening the phone camera', () => {
	it('requests the rear camera and attaches the stream to the video element', async () => {
		const stream = fakeStream();
		const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true,
			writable: true
		});
		const video = fakeVideo();

		const opened = await openCameraStream(video);

		expect(opened).toBe(stream);
		expect(getUserMedia).toHaveBeenCalledTimes(1);
		const constraints = getUserMedia.mock.calls[0][0];
		expect(JSON.stringify(constraints)).toMatch(/environment/);
		expect(video.srcObject).toBe(stream);
		expect(video.muted).toBe(true);
		expect(video.playsInline).toBe(true);
		expect(video.play).toHaveBeenCalled();
	});

	it('falls back to a looser constraint when the device rejects the first one', async () => {
		const stream = fakeStream();
		const getUserMedia = vi
			.fn(async (_constraints: MediaStreamConstraints) => stream)
			.mockRejectedValueOnce(Object.assign(new Error('too many constraints'), { name: 'OverconstrainedError' }));
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true,
			writable: true
		});

		await expect(openCameraStream(fakeVideo())).resolves.toBe(stream);
		expect(getUserMedia).toHaveBeenCalledTimes(2);
	});

	it('reports a blocked camera with a recoverable message', async () => {
		const getUserMedia = vi
			.fn(async (_constraints: MediaStreamConstraints) => fakeStream())
			.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true,
			writable: true
		});

		await expect(openCameraStream(fakeVideo())).rejects.toBeInstanceOf(CameraError);
		await expect(openCameraStream(fakeVideo())).rejects.toMatchObject({ issue: 'denied' });
	});

	it('stops every track when the camera is closed', () => {
		const track = { stop: vi.fn() };
		stopStream({ getTracks: () => [track] } as unknown as MediaStream);
		expect(track.stop).toHaveBeenCalled();
	});

	it('keeps a working camera alive when the preview cannot autoplay', async () => {
		const stream = fakeStream();
		const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true,
			writable: true
		});
		const video = fakeVideo();
		video.play = vi.fn(async () => {
			throw new Error('gesture required');
		});

		// The stream survives: the organizer only has to tap the preview.
		await expect(openCameraStream(video)).resolves.toBe(stream);
		await expect(startPreview(video)).resolves.toBe(false);
	});
});

describe('qr detection', () => {
	it('decodes a ticket payload with the software reader', () => {
		const payload = 'owltside://t/EV-7QK2-4M8P-9XRT?s=0123456789abcdef';
		const { data, dimension } = qrToImageData(payload);
		const result = jsQR(data, dimension, dimension, { inversionAttempts: 'attemptBoth' });
		expect(result?.data).toBe(payload);
	});

	it('uses the software reader when the browser has no BarcodeDetector', async () => {
		const detector = createQrDetector();
		expect(detector.native).toBe(false);
		// No camera frame in a test environment: detection simply reports nothing.
		await expect(
			detector.detect({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement)
		).resolves.toBeNull();
		detector.close();
	});

	it('uses the native detector when the browser provides one', async () => {
		const detect = vi.fn(async () => [{ rawValue: 'owltside://t/EV-AAAA-BBBB-CCCC?s=deadbeefdeadbeef' }]);
		class FakeBarcodeDetector {
			constructor(public options: { formats: string[] }) {}
			detect = detect;
		}
		vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector);

		const detector = createQrDetector();
		expect(detector.native).toBe(true);
		const value = await detector.detect({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement);
		expect(value).toBe('owltside://t/EV-AAAA-BBBB-CCCC?s=deadbeefdeadbeef');
		expect(detect).toHaveBeenCalled();
	});
});

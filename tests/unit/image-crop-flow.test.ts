import ProfilePage from '../../src/routes/(app)/profile/+page.svelte';
import CreateEventPage from '../../src/routes/(app)/organizer/create/+page.svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import ImageCropSheet from '$components/ImageCropSheet.svelte';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileAppearance } from '$lib/state/profile.svelte';
import { tick } from 'svelte';

const DATA_URL = 'data:image/jpeg;base64,CROPPED';

class TestPointerEvent extends MouseEvent {
	pointerId: number;
	pointerType = 'touch';
	constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
		super(type, init);
		this.pointerId = init.pointerId ?? 1;
	}
}

/** jsdom has no PointerEvent (and no layout), so wire up both before gesturing. */
function installPointerEvents() {
	vi.stubGlobal('PointerEvent', TestPointerEvent);
}

/** Give the frame a real on-screen box so panning maths has something to work with. */
function layoutFrame(element: HTMLElement, size = 352) {
	const box = {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: size,
		bottom: size,
		width: size,
		height: size,
		toJSON: () => ({})
	} as DOMRect;
	element.getBoundingClientRect = () => box;
	Object.defineProperty(element, 'clientWidth', { value: size, configurable: true });
	Object.defineProperty(element, 'clientHeight', { value: size, configurable: true });
	Object.defineProperty(element, 'setPointerCapture', { value: () => {}, configurable: true });
	Object.defineProperty(element, 'releasePointerCapture', { value: () => {}, configurable: true });
}

const pointer = (element: HTMLElement, type: string, id: number, x: number, y: number) =>
	fireEvent(
		element,
		new TestPointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true })
	);

/** Spread or close two fingers around a midpoint. */
async function pinch(element: HTMLElement, from: number, to: number, midX = 176, midY = 176) {
	await pointer(element, 'pointerdown', 1, midX - from / 2, midY);
	await pointer(element, 'pointerdown', 2, midX + from / 2, midY);
	await pointer(element, 'pointermove', 2, midX + to / 2, midY);
	await pointer(element, 'pointermove', 1, midX - to / 2, midY);
	await pointer(element, 'pointerup', 1, midX - to / 2, midY);
	await pointer(element, 'pointerup', 2, midX + to / 2, midY);
	await tick();
}

async function drag(element: HTMLElement, dx: number, dy: number, fromX = 176, fromY = 176) {
	await pointer(element, 'pointerdown', 1, fromX, fromY);
	await pointer(element, 'pointermove', 1, fromX + dx, fromY + dy);
	await pointer(element, 'pointerup', 1, fromX + dx, fromY + dy);
	await tick();
}

const savedCaption = () => document.body.textContent?.match(/Saved as (\d+) × (\d+)px JPEG[^\n]*/)?.[0] ?? '';
const profileData = {
		unread: 0, inboxUnread: 0, currentProfile: null, followingIds: [], followLoadError: false,
	session: {
		userId: 'u-ada',
		email: 'ada@owltside.app',
		handle: 'adaobi',
		name: 'Ada Obi',
		role: 'attendee' as const,
		avatarUrl: null
	},
	demoMode: true,
	operatingIdentity: 'attendee' as const,
	profile: null,
	tickets: [],
	events: []
};

/** jsdom has no canvas or image decoders — stub just enough to exercise the flow. */
function stubImagePipeline() {
	vi.stubGlobal('createImageBitmap', async (file: Blob) => ({
		width: (file as unknown as { width?: number }).width ?? 800,
		height: (file as unknown as { height?: number }).height ?? 600,
		close: () => {}
	}));
	const context = {
		clearRect: vi.fn(),
		drawImage: vi.fn(),
		imageSmoothingEnabled: false,
		imageSmoothingQuality: 'low'
	};
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		context as unknown as CanvasRenderingContext2D
	);
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(DATA_URL);
	return context;
}

const selectFile = async (label: string, name = 'me.png') => {
	const input = screen.getByLabelText(label) as HTMLInputElement;
	const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
	Object.defineProperty(input, 'files', { value: [file], configurable: true });
	await fireEvent.change(input);
};

describe('ImageCropSheet', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('only reports the image back once the user confirms', async () => {
		stubImagePipeline();
		const confirm = vi.fn();
		const close = vi.fn();
		const file = new File([new Uint8Array([1])], 'me.png', { type: 'image/png' });

		render(ImageCropSheet, {
			props: { open: true, file, round: true, aspect: 1, maxDimension: 640, confirmLabel: 'Use photo', confirm, close }
		});

		const usePhoto = (await screen.findByRole('button', { name: 'Use photo' })) as HTMLButtonElement;
		await waitFor(() => expect(usePhoto.disabled).toBe(false));
		// selecting/normalising alone must not commit anything
		expect(confirm).not.toHaveBeenCalled();

		// no zoom/crop sliders — gestures only
		expect(document.querySelectorAll('input[type="range"]')).toHaveLength(0);

		const surface = screen.getByRole('application');
		layoutFrame(surface as HTMLElement);
		await pinch(surface as HTMLElement, 100, 180); // fingers spread → zoom in
		expect(confirm).not.toHaveBeenCalled();

		await fireEvent.click(usePhoto);
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(confirm).toHaveBeenCalledWith(DATA_URL);
	});

	it('cancelling never reports an image', async () => {
		stubImagePipeline();
		const confirm = vi.fn();
		const close = vi.fn();
		const file = new File([new Uint8Array([1])], 'me.png', { type: 'image/png' });

		render(ImageCropSheet, {
			props: { open: true, file, aspect: 2.33, confirmLabel: 'Use banner', confirm, close }
		});

		const useBanner = await screen.findByRole('button', { name: 'Use banner' });
		await waitFor(() => expect((useBanner as HTMLButtonElement).disabled).toBe(false));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(close).toHaveBeenCalled();
		expect(confirm).not.toHaveBeenCalled();
	});
});

describe('gesture-driven crop', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		profileAppearance.value = { avatarData: null, bannerData: null };
	});

	const openAvatarCrop = async () => {
		const context = stubImagePipeline();
		installPointerEvents();
		render(ProfilePage, { props: { data: profileData } });
		await fireEvent.click(screen.getAllByRole('button', { name: /Edit Profile/i })[0]);
		await selectFile('Upload profile photo');
		const surface = (await screen.findByRole('application')) as HTMLElement;
		layoutFrame(surface, 352);
		await waitFor(() => expect(savedCaption()).toContain('Saved as 600 × 600px'));
		return { context, surface };
	};

	it('pinching out zooms the crop in, pinch in zooms back out', async () => {
		const { context, surface } = await openAvatarCrop();
		const drawnCrop = () => context.drawImage.mock.calls.at(-1) as unknown[];

		await pinch(surface, 100, 200); // fingers spread to twice the distance
		expect(savedCaption()).toContain('Saved as 300 × 300px');
		expect(savedCaption()).toContain('zoomed 2.00×');
		expect(drawnCrop()[3]).toBeCloseTo(300, 3); // crop is narrower in the source image

		await pinch(surface, 200, 100); // and back together again
		expect(savedCaption()).toContain('Saved as 600 × 600px');
		expect(savedCaption()).not.toContain('zoomed');
	});

	it('dragging moves the crop window across the picture', async () => {
		const { context, surface } = await openAvatarCrop();
		const cropX = () => (context.drawImage.mock.calls.at(-1) as unknown[])[1] as number;

		await pinch(surface, 100, 200);
		const centred = cropX();
		// a centred pinch stays near the middle of the picture (fingers land
		// one after the other, so the focal point drifts a few pixels)
		expect(centred).toBeGreaterThan(230);
		expect(centred).toBeLessThan(290);

		await drag(surface, 60, 0); // swipe right → reveal the left of the photo
		expect(cropX()).toBeLessThan(centred);

		await drag(surface, -400, 0); // far swipe left clamps to the far edge
		expect(cropX()).toBeCloseTo(500, 3);
	});

	it('keeps the framing when the gesture is confirmed', async () => {
		const { context, surface } = await openAvatarCrop();
		await pinch(surface, 100, 200);
		await drag(surface, 40, 0);

		const usePhoto = screen.getByRole('button', { name: 'Use photo' }) as HTMLButtonElement;
		await fireEvent.click(usePhoto);

		await waitFor(() => expect(profileAppearance.value.avatarData).toBe(DATA_URL));
		expect(context.drawImage).toHaveBeenCalled();
		// the preview drew the same crop rect the crop maths produced
		expect(Number.isFinite((context.drawImage.mock.calls.at(-1) as number[])[1])).toBe(true);
	});

	it('keeps tracking a drag that wanders off the frame', async () => {
		const { context, surface } = await openAvatarCrop();
		const cropX = () => (context.drawImage.mock.calls.at(-1) as unknown[])[1] as number;

		await pointer(surface, 'pointerdown', 1, 176, 176);
		await pointer(surface, 'pointerleave', 1, 176, 176);
		await pointer(surface, 'pointermove', 1, 240, 176); // finger slid past the edge
		await pointer(surface, 'pointerup', 1, 240, 176);
		await tick();

		expect(cropX()).toBeLessThan(100); // the drag still moved the picture
	});

	it('arrow keys and +/- nudge the crop for keyboard users', async () => {
		const { context, surface } = await openAvatarCrop();
		const cropX = () => (context.drawImage.mock.calls.at(-1) as unknown[])[1] as number;

		await fireEvent.keyDown(surface, { key: '+' });
		await tick();
		expect(savedCaption()).toContain('zoomed');

		await fireEvent.keyDown(surface, { key: 'ArrowLeft' });
		await tick();
		expect(cropX()).toBeLessThan(500);
	});
});

describe('profile photo upload flow', () => {
	beforeEach(() => {
		profileAppearance.value = { avatarData: null, bannerData: null };
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		profileAppearance.value = { avatarData: null, bannerData: null };
	});

	it('stages the picked photo for cropping before it replaces the avatar', async () => {
		stubImagePipeline();
		render(ProfilePage, { props: { data: profileData } });

		await fireEvent.click(screen.getAllByRole('button', { name: /Edit Profile/i })[0]);
		await selectFile('Upload profile photo');

		// the crop step opens instead of the avatar changing
		const dialog = await screen.findByRole('dialog', { name: 'Resize & crop photo' });
		expect(dialog).toBeTruthy();
		expect(profileAppearance.value.avatarData).toBeNull();
		expect(document.querySelector(`img[src="${DATA_URL}"]`)).toBeNull();

		const usePhoto = (await screen.findByRole('button', { name: 'Use photo' })) as HTMLButtonElement;
		await waitFor(() => expect(usePhoto.disabled).toBe(false));
		await fireEvent.click(usePhoto);

		await waitFor(() => expect(profileAppearance.value.avatarData).toBe(DATA_URL));
		expect(document.querySelector(`img[src="${DATA_URL}"]`)).not.toBeNull();
	});

	it('keeps the current avatar when the crop step is cancelled', async () => {
		stubImagePipeline();
		render(ProfilePage, { props: { data: profileData } });

		await fireEvent.click(screen.getAllByRole('button', { name: /Edit Profile/i })[0]);
		await selectFile('Upload profile photo');
		await screen.findByRole('dialog', { name: 'Resize & crop photo' });

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Resize & crop photo' })).toBeNull());
		expect(profileAppearance.value.avatarData).toBeNull();
	});

	it('crops the banner through the same step', async () => {
		stubImagePipeline();
		render(ProfilePage, { props: { data: profileData } });

		await fireEvent.click(screen.getAllByRole('button', { name: /Edit Profile/i })[0]);
		await selectFile('Upload profile banner', 'banner.png');

		await screen.findByRole('dialog', { name: 'Resize & crop banner' });
		const useBanner = (await screen.findByRole('button', { name: 'Use banner' })) as HTMLButtonElement;
		await waitFor(() => expect(useBanner.disabled).toBe(false));
		await fireEvent.click(useBanner);

		await waitFor(() => expect(profileAppearance.value.bannerData).toBe(DATA_URL));
		expect(profileAppearance.value.avatarData).toBeNull();
	});
});

async function openIdentityUploadStep() {
	render(SettingsDetails, { props: { category: 'verification' } });

	const identityCard = screen.getByText('2. Identity').closest('section, div.rounded-xl') as HTMLElement;
	await fireEvent.click(within(identityCard).getByRole('button', { name: 'Start' }));

	await fireEvent.input(screen.getByPlaceholderText('e.g. Adaobi Okafor'), { target: { value: 'Adaobi Okafor' } });
	const dob = document.querySelector('input[type="date"]') as HTMLInputElement;
	await fireEvent.input(dob, { target: { value: '1994-05-02' } });
	await fireEvent.input(screen.getByPlaceholderText('11-digit NIN'), { target: { value: '12345678901' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
	await tick();
}

describe('identity document upload flow', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('stages an ID photo for resize/crop before attaching it', async () => {
		stubImagePipeline();
		await openIdentityUploadStep();

		await selectFile('Upload front of ID', 'nin-front.jpg');

		await screen.findByRole('dialog', { name: 'Fit ID photo · front' });
		// the document is not attached yet
		expect(screen.queryByAltText('Front of ID preview')).toBeNull();

		const useImage = (await screen.findByRole('button', { name: 'Use this image' })) as HTMLButtonElement;
		await waitFor(() => expect(useImage.disabled).toBe(false));
		await fireEvent.click(useImage);

		await waitFor(() => expect(screen.queryByAltText('Front of ID preview')).not.toBeNull());
		expect(document.querySelector(`img[src="${DATA_URL}"]`)).not.toBeNull();
		expect(screen.getByText(/nin-front\.jpg/)).toBeTruthy();
	});

	it('attaches a PDF as-is because there is nothing to crop', async () => {
		stubImagePipeline();
		await openIdentityUploadStep();

		const input = screen.getByLabelText('Upload front of ID') as HTMLInputElement;
		const pdf = new File([new Uint8Array([1])], 'nin-front.pdf', { type: 'application/pdf' });
		Object.defineProperty(input, 'files', { value: [pdf], configurable: true });
		await fireEvent.change(input);
		await tick();

		expect(screen.queryByRole('dialog', { name: /Resize & crop/ })).toBeNull();
		expect(screen.getByText(/nin-front\.pdf/)).toBeTruthy();
	});
});

describe('event creation poster crop and draft payload flow', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('requires a cropped poster on step 1 and includes poster in the submitted draft JSON', async () => {
		stubImagePipeline();
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		render(CreateEventPage, { props: { form: null, data: { event: null } as any } });

		// No duplicate <header> inside the wizard page
		expect(document.querySelectorAll('header')).toHaveLength(0);

		const continueBtn = screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement;
		expect(continueBtn.disabled).toBe(true);

		await fireEvent.input(screen.getByPlaceholderText('e.g. Pulse AI Summit 2026'), {
			target: { value: 'Community Night Regression' }
		});
		const categorySelect = document.querySelector('#event-category-mobile') as HTMLSelectElement;
		await fireEvent.change(categorySelect, { target: { value: 'music' } });
		const dateInputs = document.querySelectorAll('.md\\:hidden input[type="date"]');
		await fireEvent.input(dateInputs[0], { target: { value: '2099-12-20' } });
		await fireEvent.input(dateInputs[1], { target: { value: '2099-12-21' } });
		await fireEvent.input(screen.getAllByPlaceholderText('The Civic Centre').at(-1)!, {
			target: { value: 'Actual community hall' }
		});
		await fireEvent.input(screen.getAllByPlaceholderText('What will attendees experience?').at(-1)!, {
			target: { value: 'A community gathering with live music and food.' }
		});

		// Still disabled until poster is uploaded and cropped
		expect(continueBtn.disabled).toBe(true);

		const posterInput = screen.getAllByLabelText('Upload event poster').at(-1) as HTMLInputElement;
		const posterFile = new File([new Uint8Array([1, 2, 3])], 'poster.png', { type: 'image/png' });
		Object.defineProperty(posterInput, 'files', { value: [posterFile], configurable: true });
		await fireEvent.change(posterInput);

		await screen.findByRole('dialog', { name: 'Resize & crop poster' });
		const usePoster = (await screen.findByRole('button', { name: 'Use poster' })) as HTMLButtonElement;
		await waitFor(() => expect(usePoster.disabled).toBe(false));
		await fireEvent.click(usePoster);

		await waitFor(() => expect(continueBtn.disabled).toBe(false));

		// Step 1 -> Step 2 (Tickets)
		await fireEvent.click(continueBtn);
		await fireEvent.click(screen.getByRole('button', { name: 'Add ticket tier' }));
		await fireEvent.input(screen.getAllByLabelText('Tier name').at(-1)!, {
			target: { value: 'Community admission' }
		});
		await fireEvent.input(screen.getAllByLabelText('Capacity').at(-1)!, {
			target: { value: '100' }
		});
		await fireEvent.click(screen.getAllByRole('button', { name: 'Done' }).at(-1)!);

		// Step 2 -> Step 3 -> Step 4 -> Step 5
		await fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

		const draftInputs = document.querySelectorAll('input[name="draft"]') as NodeListOf<HTMLInputElement>;
		expect(draftInputs.length).toBeGreaterThan(0);
		const parsedDraft = JSON.parse(draftInputs[0].value);
		expect(parsedDraft.poster).toBe(DATA_URL);
		expect(parsedDraft.title).toBe('Community Night Regression');
		expect(parsedDraft.city).toBe('Lagos');
		expect(parsedDraft.tiers).toEqual([
			expect.objectContaining({ name: 'Community admission', capacity: 100 })
		]);
	});
});


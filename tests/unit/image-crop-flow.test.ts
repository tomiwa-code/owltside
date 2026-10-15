import ProfilePage from '../../src/routes/(app)/profile/+page.svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import ImageCropSheet from '$components/ImageCropSheet.svelte';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileAppearance } from '$lib/state/profile.svelte';
import { tick } from 'svelte';

const DATA_URL = 'data:image/jpeg;base64,CROPPED';
const profileData = {
	session: null,
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

		const zoom = screen.getByLabelText('Zoom and resize') as HTMLInputElement;
		await fireEvent.input(zoom, { target: { value: '1.8' } });
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

		await screen.findByRole('dialog', { name: 'Resize & crop · front of ID' });
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

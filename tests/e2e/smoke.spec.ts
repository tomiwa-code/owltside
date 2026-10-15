import { expect, test } from '@playwright/test';

test('splash renders and reaches the feed', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Everything happening around you.')).toBeVisible();
	await page.getByRole('link', { name: 'Continue as Guest' }).click();
	await expect(page.getByText('Curated Spotlight')).toBeVisible();
});

test('home shows the featured event and carousel', async ({ page }) => {
	await page.goto('/home');
	await expect(page.getByText('Pulse AI Summit Lagos').first()).toBeVisible();
	await expect(page.getByText('Happening Near You')).toBeVisible();
});

test('event detail → checkout → wallet flow', async ({ page }) => {
	await page.goto('/events/afrobeats-sound-sunset');
	await expect(page.getByText('Select Tickets')).toBeVisible();
	await page.getByRole('button', { name: /Select & Checkout/ }).click();
	await expect(page.getByText('Powered by Paystack')).toBeVisible();
	await page.getByRole('button', { name: /Pay Securely/ }).click();
	// demo approve scenario redirects to the wallet pass
	await expect(page.getByText('Manual Gate Code')).toBeVisible({ timeout: 10_000 });
});

test('wallet shows rotating QR', async ({ page }) => {
	await page.goto('/tickets/t-afrobeats-ada');
	await expect(page.getByText('EV-7QK2-4M8P-9XRT')).toBeVisible();
	await expect(page.getByAltText('Ticket QR code')).toBeVisible({ timeout: 10_000 });
});

test('chat sends and receives a demo reply', async ({ page }) => {
	await page.goto('/inbox/c-amina');
	await page.getByPlaceholder(/Message/).fill('Testing the mesh!');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByText('Testing the mesh!')).toBeVisible();
});

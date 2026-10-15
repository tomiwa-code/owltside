import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const origin = 'http://localhost:5173';
test.beforeEach(async ({ context }) => {
	await context.addCookies([
		{ name: 'owltside_demo_session', value: '1', url: origin },
		{ name: 'owltside_operating_identity', value: 'organizer', url: origin }
	]);
});

for (const viewport of [{ width: 393, height: 851 }, { width: 1440, height: 1000 }]) {
	test(`one shared header across the app at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		for (const route of ['/home', '/explore', '/notifications', '/profile', '/tickets', '/organizer/create']) {
			await page.goto(route);
			await expect(page.locator('header')).toHaveCount(1);
			await expect(page.locator('header').getByRole('link', { name: 'Your profile' })).toBeVisible();
			await expect(page.locator('header').getByRole('link', { name: 'Notifications' })).toBeVisible();
		}
	});
}

test('follow state and counts survive refresh, and drawers fetch the same relationships', async ({ page, request }) => {
	const [target] = await (await request.get('/api/profiles/search?q=amina')).json();
	const reset = await page.request.put(`/api/profiles/${target.id}/follow`, { data: { following: false } });
	expect(reset.ok()).toBe(true);
	await page.goto(`/users/${target.handle}`); await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Follow', exact: true }).last().click();
	await expect(page.getByRole('button', { name: 'Following', exact: true }).last()).toBeVisible();
	await page.reload(); await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: 'Following', exact: true }).last()).toBeVisible();
	await page.goto('/profile'); await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: /Following$/ }).last().click();
	await expect(page.getByRole('dialog').getByRole('link', { name: new RegExp(target.name) })).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Following', exact: true }).click();
	await expect(page.getByRole('dialog').getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close sheet', exact: true }).click();
	await page.reload();
	await expect(page.getByRole('button', { name: '0 Following', exact: true }).last()).toBeVisible();
});

test('search finds actual users and venues, including client-side query changes', async ({ page, request }) => {
	await page.goto('/explore'); await page.waitForLoadState('networkidle');
	await page.getByRole('tab', { name: /Users/ }).last().click();
	await page.getByPlaceholder('Search users by name, handle, or city…').last().fill('Amina');
	await expect(page.getByRole('link', { name: /Dr. Amina Bello/ }).last()).toBeVisible();
	const events = await (await request.get('/api/events')).json();
	await page.getByRole('tab', { name: /Venues/ }).last().click();
	await page.getByPlaceholder('Search venues by name or city…').last().fill(events[0].venue);
	await expect(page.getByText(events[0].venue, { exact: true }).last()).toBeVisible();
});

test('empty event draft requires a real poster, crops it, and publishes supplied data', async ({ page }) => {
	await page.goto('/organizer/create'); await page.waitForLoadState('networkidle');
	await expect(page.getByPlaceholder('e.g. Pulse AI Summit 2026')).toHaveValue('');
	await expect(page.getByRole('button', { name: /Continue/ })).toBeDisabled();
	await page.getByPlaceholder('e.g. Pulse AI Summit 2026').fill('Community Night Regression');
	await page.locator('#event-category-mobile').selectOption('music');
	await page.locator('input[type=date]:visible').nth(0).fill('2099-12-20');
	await page.locator('input[type=date]:visible').nth(1).fill('2099-12-21');
	await page.getByPlaceholder('The Civic Centre').last().fill('Actual community hall');
	await page.getByPlaceholder('What will attendees experience?').last().fill('A community gathering with live music and food.');
	await expect(page.getByRole('button', { name: /Continue/ })).toBeDisabled();
	const buffer = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#8877cc' } }).png().toBuffer();
	await page.getByLabel('Upload event poster').last().setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer });
	await page.getByRole('button', { name: 'Use poster', exact: true }).click();
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.getByRole('button', { name: 'Add ticket tier', exact: true }).click();
	await page.getByLabel('Tier name', { exact: true }).last().fill('Community admission');
	await page.getByLabel('Capacity', { exact: true }).last().fill('100');
	await page.getByRole('button', { name: 'Done', exact: true }).last().click();
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.getByRole('button', { name: 'Publish event', exact: true }).click();
	await expect(page).toHaveURL(/\/organizer\/events\//);
	await expect(page.getByRole('heading', { name: 'Community Night Regression', exact: true })).toBeVisible();
});


test('a changed profile photo appears in the shared notification header after refresh', async ({ page }) => {
	await page.goto('/profile'); await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: /Edit Profile/i }).last().click();
	const buffer = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#cc8877' } }).png().toBuffer();
	await page.getByLabel('Upload profile photo').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer });
	await page.getByRole('button', { name: 'Use photo', exact: true }).click();
	await expect(page.locator('header a[aria-label="Your profile"] img')).toBeVisible();
	await page.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.locator('header a[aria-label="Notifications"]').click();
	await expect(page.locator('header a[aria-label="Your profile"] img')).toBeVisible();
	await page.reload();
	await expect(page.locator('header a[aria-label="Your profile"] img')).toBeVisible();
});


for (const width of [393, 1440]) {
	test(`profile switches roles and keeps the selected mode after refresh at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 950 });
		await page.goto('/profile'); await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Switch role', exact: true }).click();
		await page.getByRole('dialog', { name: 'Switch role', exact: true }).getByRole('button', { name: /^Attendee/ }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.getByText('Current role: Attendee', { exact: true })).toBeVisible();
		await expect(page.locator('nav[aria-label="Primary"] a[href="/organizer"]')).toHaveCount(0);
		await page.reload(); await page.waitForLoadState('networkidle');
		await expect(page.getByText('Current role: Attendee', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Switch role', exact: true }).click();
		await page.getByRole('dialog', { name: 'Switch role', exact: true }).getByRole('button', { name: /^Organizer/ }).click();
		await expect(page.getByRole('link', { name: /Open organizer console/ })).toBeVisible();
		await page.getByRole('link', { name: /Open organizer console/ }).click();
		await expect(page).toHaveURL(/\/organizer$/);
		await page.goto('/profile'); await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Switch role', exact: true }).click();
		await page.getByRole('dialog', { name: 'Switch role', exact: true }).getByRole('button', { name: /^Guest/ }).click();
		await expect(page.getByText('Current role: Guest', { exact: true })).toBeVisible();
		// Guest mode is not a sign-out; the account can switch back immediately.
		await expect(page.getByRole('button', { name: 'Switch role', exact: true })).toBeVisible();
		await expect(page.locator('button:visible').filter({ hasText: 'Edit Profile' })).toBeVisible();
	});
}

test('settings switches roles through the same control without nested dialogs', async ({ page }) => {
	await page.goto('/settings'); await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: /Operating Identity/ }).last().click();
	await expect(page.getByRole('dialog')).toHaveCount(1);
	await page.getByRole('dialog').getByRole('button', { name: /^Attendee/ }).click();
	await expect(page.getByText('Current role: Attendee', { exact: true })).toBeVisible();
	await page.reload(); await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: /Operating Identity/ }).last().click();
	await expect(page.getByRole('dialog').getByRole('button', { name: /^Attendee/ })).toHaveAttribute('aria-pressed', 'true');
});

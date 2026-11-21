import { expect, test } from '@playwright/test';

test('legal policies are accessible to visitors and existing section links work', async ({ page }) => {
	await page.goto('/legal#terms');
	await expect(page.getByRole('heading', { name: 'Terms & conditions' })).toBeVisible();
	await expect(page.getByRole('heading', { name: '6. Cancellations, changes and refunds' })).toBeVisible();
	await expect(page.getByText('Policy draft:')).toBeVisible();

	await page.getByRole('navigation', { name: 'Legal sections' }).getByRole('link', { name: 'Privacy policy' }).click();
	await expect(page).toHaveURL(/#privacy$/);
	await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
	await expect(page.locator('#cookies')).toContainText('browser storage');
	await expect(page.locator('#licenses')).toContainText('Licenses & attribution');
});

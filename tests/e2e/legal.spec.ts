import { expect, test } from '@playwright/test';

test('legal policies for Nigeria are accessible to visitors and section navigation works', async ({ page }) => {
	await page.goto('/legal#terms');
	await expect(page.getByRole('heading', { name: /Terms of Use/i })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Refund Policy/i })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Ticket Services Agreement/i })).toBeVisible();
	await expect(page.getByText(/Territorial Scope \(Nigeria Only\):/)).toBeVisible();

	const nav = page.getByRole('navigation', { name: 'Legal sections' });
	await nav.getByRole('link', { name: 'Refund Policy' }).click();
	await expect(page).toHaveURL(/#refunds$/);

	await nav.getByRole('link', { name: 'Privacy Policy' }).click();
	await expect(page).toHaveURL(/#privacy$/);

	await nav.getByRole('link', { name: 'Ticket Services Agreement' }).click();
	await expect(page).toHaveURL(/#tsa$/);

	await expect(page.locator('#cookies')).toContainText('browser storage');
	await expect(page.locator('#licenses')).toContainText('Licenses & attribution');
});

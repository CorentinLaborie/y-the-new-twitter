import { expect, test } from '@playwright/test';

test('the home page shows the Y title and the API status', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Y' })).toBeVisible();
  // The API may be up, degraded or unreachable here: any of the three states is a valid page.
  await expect(page.getByRole('status')).toHaveText(/API (disponible|dégradée|injoignable)/);
});

test('the home page has no horizontal scroll at this viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

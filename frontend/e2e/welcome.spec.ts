import { expect, test } from '@playwright/test';

test('the welcome page shows the title and its two links', async ({ page }) => {
  await page.goto('/welcome');

  await expect(page.getByRole('heading', { level: 1, name: 'On ne demande jamais assez' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Se connecter', exact: true })).toHaveAttribute(
    'href',
    '/login',
  );
  await expect(page.getByRole('link', { name: 'Rejoindre la communauté' })).toHaveAttribute(
    'href',
    '/signup',
  );
});

test('the welcome page has no horizontal scroll at this viewport', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByRole('link', { name: 'Se connecter', exact: true })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

import { expect, test } from '@playwright/test';

// The visitor landing on "/" (guests). The redirect of a signed-in user is a server-side check against the API, which
// the browser mocks cannot reach: it is covered by components/landing/landing-gate.test.tsx.

test('a guest on "/" sees the visitor landing and the sign-in link', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Y, le réseau social qui vous fait réfléchir.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
});

test('the sign-in link opens the login page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Se connecter' }).click();

  await page.waitForURL((url) => url.pathname === '/login');
});

test('the landing has no horizontal scroll from 360 px to a wide desktop', async ({ page }) => {
  for (const width of [360, 375, 600, 768, 1023, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
  }
});

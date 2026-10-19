import { expect, test } from '@playwright/test';

// End-to-end checks against the real backend and its local database (no simulated API).
// They need the backend running on localhost:8080, on a database with the fictional seed and
// the password Secret1234! set on demo_alice (see the M1 integration notes). Each test leaves the account usable.

const EMAIL = 'demo_alice@example.test';
const PASSWORD = 'Secret1234!';

test.describe.configure({ mode: 'serial' });

test('a visitor without session is sent from the protected home to the login page, which keeps the page asked for', async ({
  page,
}) => {
  await page.goto('/home');
  await page.waitForURL((url) => url.pathname === '/login');
  // The proxy passes the requested path to the session check, so the login page remembers it.
  expect(new URL(page.url()).searchParams.get('next')).toBe('/home');
});

test('a wrong password shows the generic error and keeps the user on the login page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Mauvais-mot-2!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'Identifiants incorrects',
  );
  await expect(page).toHaveURL(/\/login/);
});

test('a valid login opens the protected home, and the session survives a reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  await page.waitForURL((url) => url.pathname === '/home');
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
});

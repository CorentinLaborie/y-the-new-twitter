import { expect, test } from '@playwright/test';
import { bodyOf, mockAuthApi, notice, problem, ui } from './auth-kit';

const KNOWN_EMAIL = 'alice@example.com';
const UNKNOWN_EMAIL = 'personne@example.com';
const NEW_PASSWORD = 'Nouveau1234!';

test('a reset request gives the same answer whatever the e-mail address', async ({ page }) => {
  // The API answers 202 for every address (section 9.4): the page must behave the same for both.
  const calls = await mockAuthApi(page, { 'POST /auth/password-reset/request': { status: 202 } });

  for (const email of [KNOWN_EMAIL, UNKNOWN_EMAIL]) {
    await page.goto('/forgot-password');
    await page.getByLabel(ui.email, { exact: true }).fill(email);
    await page.getByRole('button', { name: ui.submitForgot, exact: true }).click();

    await page.waitForURL((url) => url.pathname === '/forgot-password/confirm');
    expect(new URL(page.url()).searchParams.get('email')).toBe(email);
    await expect(notice(page)).toHaveCount(0);
  }

  expect(calls.filter((call) => call.path === '/auth/password-reset/request')).toHaveLength(2);
  expect(bodyOf(calls, 'POST /auth/password-reset/request')).toEqual({ email: KNOWN_EMAIL });
});

test('the confirm page sends the code and the new password', async ({ page }) => {
  const calls = await mockAuthApi(page, { 'POST /auth/password-reset/confirm': { status: 200, body: {} } });

  await page.goto(`/forgot-password/confirm?email=${encodeURIComponent(KNOWN_EMAIL)}`);
  await page.getByLabel(ui.code, { exact: true }).fill('654321');
  await page.getByLabel(ui.newPassword, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: ui.submitReset, exact: true }).click();

  // After a successful reset the page says so and offers a link to the login page (no automatic redirect).
  await expect(page.getByRole('status')).toContainText('Votre mot de passe a été changé.');
  await page.getByRole('link', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  expect(bodyOf(calls, 'POST /auth/password-reset/confirm')).toEqual({
    email: KNOWN_EMAIL,
    code: '654321',
    password: NEW_PASSWORD,
  });
});

test('a wrong code on the confirm page shows an error and keeps the user there', async ({ page }) => {
  await mockAuthApi(page, {
    'POST /auth/password-reset/confirm': problem(422, 'Code incorrect ou expiré.'),
  });

  await page.goto(`/forgot-password/confirm?email=${encodeURIComponent(KNOWN_EMAIL)}`);
  await page.getByLabel(ui.code, { exact: true }).fill('000000');
  await page.getByLabel(ui.newPassword, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: ui.submitReset, exact: true }).click();

  await expect(notice(page)).toContainText(/code est incorrect/i);
  await expect(page).toHaveURL(/\/forgot-password\/confirm\?/);
});

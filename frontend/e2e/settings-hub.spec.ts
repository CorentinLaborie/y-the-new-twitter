import { expect, test } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockSettingsApi, settingsProblem } from './settings-kit';

// The settings hub (plan L5, section 6.1). Mocked API. The sections are links, the legal pages are reachable, and the
// sign-out goes through the server before the login page.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('the hub shows the e-mail of the account, the sections and the legal links', async ({ page }) => {
  await mockSettingsApi(page);

  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
  await expect(page.getByText('alice@example.test')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Changer de mot de passe' })).toHaveAttribute('href', '/settings/password');
  await expect(page.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute('href', '/privacy');
  await expect(page.getByRole('link', { name: 'Comptes bloqués' })).toHaveAttribute('href', '/settings/blocked');
  await expect(page.getByRole('link', { name: 'Supprimer mon compte' })).toHaveAttribute('href', '/settings/delete-account');
});

test('a read error shows the message and Réessayer loads the account again', async ({ page }) => {
  let calls = 0;
  await mockSettingsApi(page, {
    account: () => {
      calls += 1;
      return calls === 1 ? settingsProblem(500, 'Erreur.') : { status: 200, body: { handle: 'alice', displayName: 'Alice Martin', email: 'alice@example.test', status: 'active', deletionPurgeAt: null } };
    },
  });

  await page.goto('/settings');
  await expect(page.getByText('Vos paramètres n’ont pas pu être chargés.')).toBeVisible();
  await page.getByRole('button', { name: 'Réessayer' }).click();

  await expect(page.getByText('alice@example.test')).toBeVisible();
});

test('the sign-out is confirmed by the server, then the login page opens', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  await expect(page).toHaveURL(/\/login/);
  expect(calls.logoutCalls).toEqual(['/auth/logout']);
});

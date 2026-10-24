import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockSettingsApi } from './settings-kit';

// Asking for the deletion of the account (plan L5, section 6.5). Mocked API. The confirmation dialog is shown before
// anything is sent, and the purge date is shown on the page after the request.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function fillForm(page: Page) {
  await page.getByLabel('Mot de passe actuel').fill('Mon-mot-2!');
  await page.getByLabel('Spam').check();
  await page.getByLabel('Adresse e-mail').fill('me@example.test');
  await page.getByRole('button', { name: 'Demander la suppression' }).click();
}

test('the deletion is confirmed in a dialog, then the saved message and the purge date are shown', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings/delete-account');
  await fillForm(page);
  await expect(page.getByRole('dialog', { name: 'Demander la suppression de votre compte ?' })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();

  await expect(page.getByText('Votre demande de suppression est enregistrée. Reconnectez-vous avant 90 jours pour l’annuler.')).toBeVisible();
  await expect(page.getByText(/Date de purge prévue/)).toContainText('21 janvier 2027');
  expect(calls.deletionCalls).toEqual([expect.objectContaining({ reasonCode: 'spam', email: 'me@example.test' })]);
});

test('Annuler in the dialog sends nothing and keeps the form', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings/delete-account');
  await fillForm(page);
  await page.getByRole('button', { name: 'Annuler' }).click();

  await expect(page.getByRole('button', { name: 'Demander la suppression' })).toBeVisible();
  expect(calls.deletionCalls).toHaveLength(0);
});

import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockSettingsApi, settingsProblem } from './settings-kit';

// The password page (plan L5, section 6.2). Mocked API. A confirmation that does not match is refused without any call.

const OLD = 'Ancien-mot-2!';
const NEW = 'Nouveau-mot-3!';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function fillForm(page: Page, current: string, next: string, confirmation: string) {
  await page.getByLabel('Mot de passe actuel').fill(current);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(next);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(confirmation);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
}

test('a password change sends the two passwords and says it was changed', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings/password');
  await fillForm(page, OLD, NEW, NEW);

  await expect(page.getByText('Votre mot de passe a été modifié.')).toBeVisible();
  expect(calls.passwordCalls).toEqual([{ currentPassword: OLD, newPassword: NEW }]);
});

test('a confirmation that does not match is refused without any call', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings/password');
  await fillForm(page, OLD, NEW, 'Autre-mot-4!');

  await expect(page.getByText('Les deux mots de passe ne correspondent pas.')).toBeVisible();
  expect(calls.passwordCalls).toHaveLength(0);
});

test('a wrong current password shows its message under the current field', async ({ page }) => {
  await mockSettingsApi(page, {
    password: () => settingsProblem(422, 'Le mot de passe est incorrect.'),
  });

  await page.goto('/settings/password');
  await fillForm(page, 'Mauvais-mot-2!', NEW, NEW);

  await expect(page.getByText('Le mot de passe est incorrect.')).toBeVisible();
});

test('the forgotten password link opens the reset page', async ({ page }) => {
  await mockSettingsApi(page);

  await page.goto('/settings/password');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();

  await expect(page).toHaveURL(/\/forgot-password/);
});

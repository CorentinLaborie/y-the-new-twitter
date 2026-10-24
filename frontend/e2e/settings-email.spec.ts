import { expect, test } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockSettingsApi, settingsProblem } from './settings-kit';

// The address change in two steps (plan L5, section 6.3). Mocked API: the code is not sent to a real mailbox.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('the address change asks for the code, then confirms it and says the address was changed', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings/email');
  await page.getByLabel('Nouvelle adresse e-mail').fill('nouvelle@example.test');
  await page.getByLabel('Mot de passe actuel').fill('Ancien-mot-2!');
  await page.getByRole('button', { name: 'Envoyer le code' }).click();

  await page.getByLabel('Code à six chiffres').fill('123456');
  await page.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByText('Votre adresse a été modifiée.')).toBeVisible();
  expect(calls.emailRequestCalls).toEqual([{ newEmail: 'nouvelle@example.test', password: 'Ancien-mot-2!' }]);
  expect(calls.emailConfirmCalls).toEqual(['123456']);
});

test('a wrong code keeps the user on the code step with its message', async ({ page }) => {
  await mockSettingsApi(page, {
    emailConfirm: () => settingsProblem(422, 'Code.'),
  });

  await page.goto('/settings/email');
  await page.getByLabel('Nouvelle adresse e-mail').fill('nouvelle@example.test');
  await page.getByLabel('Mot de passe actuel').fill('Ancien-mot-2!');
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  await page.getByLabel('Code à six chiffres').fill('000000');
  await page.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByText('Le code est incorrect ou a expiré.')).toBeVisible();
});

test('resending the code says a new one was sent', async ({ page }) => {
  await mockSettingsApi(page);

  await page.goto('/settings/email');
  await page.getByLabel('Nouvelle adresse e-mail').fill('nouvelle@example.test');
  await page.getByLabel('Mot de passe actuel').fill('Ancien-mot-2!');
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  await page.getByRole('button', { name: 'Renvoyer le code' }).click();

  await expect(page.getByText('Un nouveau code a été envoyé.')).toBeVisible();
});

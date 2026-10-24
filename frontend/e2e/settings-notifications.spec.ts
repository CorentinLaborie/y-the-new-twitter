import { expect, test } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockSettingsApi } from './settings-kit';

// The notification settings (plan L5, section 6.4). Mocked API. A switch changes at once and is announced; the
// reactions row sends its three kinds.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('a switch changes at once, and the change is announced', async ({ page }) => {
  const calls = await mockSettingsApi(page, { notificationItems: [{ type: 'mention', enabled: true }] });

  await page.goto('/settings/notifications');
  const mentions = page.getByRole('switch', { name: 'Mentions' });
  await expect(mentions).toHaveAttribute('aria-checked', 'true');
  await mentions.click();

  await expect(page.getByText('Préférence enregistrée.')).toBeVisible();
  await expect(mentions).toHaveAttribute('aria-checked', 'false');
  expect(calls.notificationCalls).toEqual([{ type: 'mention', enabled: false }]);
});

test('the reactions row switches its three kinds together', async ({ page }) => {
  const calls = await mockSettingsApi(page);

  await page.goto('/settings/notifications');
  await page.getByRole('switch', { name: 'Réactions (J’aime, Pas d’accord, Y)' }).click();

  await expect(page.getByText('Préférence enregistrée.')).toBeVisible();
  expect(calls.notificationCalls.map((call) => call.type)).toEqual(['reaction_like', 'reaction_dislike', 'reaction_y']);
});

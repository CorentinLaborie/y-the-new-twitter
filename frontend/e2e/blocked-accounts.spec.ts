import { expect, test } from '@playwright/test';
import { signIn } from './feed-kit';
import { blockedAccount, mockReportBlockApi } from './report-block-kit';

// The page of the blocked accounts (plan L6, S6): the list, lifting a block without confirmation, and the empty list.
// Mocked API.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('the blocked accounts are listed, and lifting one takes its row away with no confirmation', async ({ page }) => {
  const calls = await mockReportBlockApi(page, {
    blocked: () => ({
      status: 200,
      body: { items: [blockedAccount('marthe', 'Marthe Dupont')], nextCursor: null },
    }),
  });

  await page.goto('/settings/blocked');
  await expect(page.getByRole('heading', { name: 'Comptes bloqués' })).toBeVisible();
  await expect(page.getByText('Marthe Dupont')).toBeVisible();

  await page.getByRole('button', { name: 'Débloquer' }).click();

  await expect(page.getByText('Marthe Dupont')).toBeHidden();
  await expect(page.getByText('@marthe est débloqué.')).toBeVisible();
  expect(calls.blockCalls).toEqual([expect.objectContaining({ method: 'DELETE', handle: 'marthe' })]);
});

test('an empty list says that no account is blocked', async ({ page }) => {
  await mockReportBlockApi(page);

  await page.goto('/settings/blocked');

  await expect(page.getByText('Vous n’avez bloqué aucun compte.')).toBeVisible();
});

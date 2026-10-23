import { expect, test } from '@playwright/test';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';
import { mockReportBlockApi } from './report-block-kit';

// Blocking an author from the ⋯ menu of a question (plan L6, S6). Mocked API.

const QUESTION_TEXT = 'Question d’un compte que je bloque';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('blocking the author removes the card at once, and sends one block for the handle', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([question('b1', QUESTION_TEXT)]) });
  const calls = await mockReportBlockApi(page);
  await page.goto('/home');
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();

  await page.getByRole('button', { name: 'Plus d’options' }).click();
  await page.getByRole('menuitem', { name: 'Bloquer @marthe_b1' }).click();
  await expect(page.getByRole('dialog', { name: 'Bloquer @marthe_b1 ?' })).toBeVisible();
  await page.getByRole('button', { name: 'Bloquer', exact: true }).click();

  await expect(page.getByText(QUESTION_TEXT)).toBeHidden();
  expect(calls.blockCalls).toEqual([expect.objectContaining({ method: 'PUT', handle: 'marthe_b1' })]);
});

test('Annuler on the block dialog sends nothing and keeps the card', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([question('b2', QUESTION_TEXT)]) });
  const calls = await mockReportBlockApi(page);
  await page.goto('/home');

  await page.getByRole('button', { name: 'Plus d’options' }).click();
  await page.getByRole('menuitem', { name: 'Bloquer @marthe_b2' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();

  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();
  expect(calls.blockCalls).toHaveLength(0);
});

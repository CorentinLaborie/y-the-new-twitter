import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';
import { mockReportBlockApi, reportProblem, type ReportBlockHandlers } from './report-block-kit';

// Reporting a question from its ⋯ menu (plan L6, S5). Mocked API. The report mock is registered after the feed mock,
// so it is tried first: a call it does not answer falls back to the feed mock.

const QUESTION_ID = 'q-report';
const QUESTION_TEXT = 'Question à signaler pour un motif';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function openReportDialog(page: Page, handlers: ReportBlockHandlers = {}) {
  await mockFeedApi(page, { feed: () => feedPage([question(QUESTION_ID, QUESTION_TEXT)]) });
  const calls = await mockReportBlockApi(page, handlers);
  await page.goto('/home');
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();

  await page.getByRole('button', { name: 'Plus d’options' }).click();
  await page.getByRole('menuitem', { name: 'Signaler' }).click();
  await expect(page.getByRole('dialog', { name: 'Signaler cette question' })).toBeVisible();

  return calls;
}

test('reporting a question sends one report with its reason and key, and says it was sent', async ({ page }) => {
  const calls = await openReportDialog(page);

  await page.getByRole('radio', { name: 'Spam' }).check();
  await page.getByRole('button', { name: 'Signaler' }).click();

  await expect(page.getByText('Merci. Votre signalement a été envoyé.')).toBeVisible();
  expect(calls.reportCalls).toHaveLength(1);
  expect(calls.reportCalls[0]?.body).toEqual({ questionId: QUESTION_ID, reason: 'spam' });
  expect(calls.reportCalls[0]?.idempotencyKey).toBeTruthy();
  expect(calls.reportCalls[0]?.csrf).toBeTruthy();
});

test('Autre needs details: Signaler stays off until they are given, and they are sent trimmed', async ({ page }) => {
  const calls = await openReportDialog(page);

  await page.getByRole('radio', { name: 'Autre' }).check();
  await expect(page.getByRole('button', { name: 'Signaler' })).toBeDisabled();
  await page.getByLabel(/Précisez le motif/).fill('  Texte trompeur  ');
  await page.getByRole('button', { name: 'Signaler' }).click();

  await expect(page.getByText('Merci. Votre signalement a été envoyé.')).toBeVisible();
  expect(calls.reportCalls[0]?.body).toEqual({ questionId: QUESTION_ID, reason: 'other', details: 'Texte trompeur' });
});

test('a question that is no longer available closes with Fermer and the unavailable message', async ({ page }) => {
  await openReportDialog(page, { report: () => reportProblem(404, 'Contenu introuvable.') });

  await page.getByRole('radio', { name: 'Spam' }).check();
  await page.getByRole('button', { name: 'Signaler' }).click();

  await expect(page.getByText('Ce contenu n’est plus disponible.')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog', { name: 'Signaler cette question' })).toBeHidden();
});

test('Annuler closes the dialog and sends nothing', async ({ page }) => {
  const calls = await openReportDialog(page);

  await page.getByRole('button', { name: 'Annuler' }).click();

  await expect(page.getByRole('dialog', { name: 'Signaler cette question' })).toBeHidden();
  expect(calls.reportCalls).toHaveLength(0);
});

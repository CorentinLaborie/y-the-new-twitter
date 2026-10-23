import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';
import { mockReportBlockApi } from './report-block-kit';

// The report and the block dialogs at 325 px wide (plan L6, sections 9 and 10). Mocked API. The sheet at the bottom of
// the screen fits the width, its buttons are at least 44 px high, and the page has no horizontal scroll.

const VIEWPORT = { width: 325, height: 640 };
const MIN_TOUCH_TARGET = 44;
const QUESTION_TEXT = 'Question pour le contrôle 325 px';
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openMenuOfFirstQuestion(page: Page) {
  await mockFeedApi(page, { feed: () => feedPage([question('n1', QUESTION_TEXT)]) });
  await mockReportBlockApi(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto('/home');
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();
  await page.getByRole('button', { name: 'Plus d’options' }).click();
}

test('at 325 px the report sheet fits the screen, with 44 px buttons and no horizontal scroll', async ({ page }) => {
  await openMenuOfFirstQuestion(page);
  await page.getByRole('menuitem', { name: 'Signaler' }).click();

  const dialog = page.getByRole('dialog', { name: 'Signaler cette question' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(VIEWPORT.width);
  for (const name of ['Annuler', 'Signaler']) {
    const height = (await page.getByRole('button', { name, exact: true }).boundingBox())?.height ?? 0;
    expect(height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
  await expectNoHorizontalScroll(page);
});

test('at 325 px the block sheet keeps its explanation and its buttons on screen', async ({ page }) => {
  await openMenuOfFirstQuestion(page);
  await page.getByRole('menuitem', { name: 'Bloquer @marthe_n1' }).click();

  await expect(page.getByText('Vos abonnements réciproques seront retirés.')).toBeVisible();
  const height = (await page.getByRole('button', { name: 'Bloquer', exact: true }).boundingBox())?.height ?? 0;
  expect(height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  await expectNoHorizontalScroll(page);
});

test('at 325 px the report sheet has no WCAG 2.2 AA violation', async ({ page }) => {
  await openMenuOfFirstQuestion(page);
  await page.getByRole('menuitem', { name: 'Signaler' }).click();
  await expect(page.getByRole('dialog', { name: 'Signaler cette question' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

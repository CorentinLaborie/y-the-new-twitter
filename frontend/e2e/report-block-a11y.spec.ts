import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';
import { mockReportBlockApi } from './report-block-kit';

// axe (WCAG 2.2 AA) on the report and block dialogs and on their menus, at the three board widths (plan L6, section 10).
// Mocked API.

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BOARD_WIDTHS = [360, 768, 1440];
const QUESTION_TEXT = 'Question pour l’audit d’accessibilité';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoAxeViolation(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
}

for (const width of BOARD_WIDTHS) {
  test(`at ${width} px the card menu and the report and block dialogs have no WCAG 2.2 AA violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockFeedApi(page, { feed: () => feedPage([question('x1', QUESTION_TEXT)]) });
    await mockReportBlockApi(page);
    await page.goto('/home');
    await expect(page.getByText(QUESTION_TEXT)).toBeVisible();

    await page.getByRole('button', { name: 'Plus d’options' }).click();
    await expectNoAxeViolation(page);

    await page.getByRole('menuitem', { name: 'Signaler' }).click();
    await expect(page.getByRole('dialog', { name: 'Signaler cette question' })).toBeVisible();
    await expectNoAxeViolation(page);

    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.getByRole('button', { name: 'Plus d’options' }).click();
    await page.getByRole('menuitem', { name: 'Bloquer @marthe_x1' }).click();
    await expect(page.getByRole('dialog', { name: 'Bloquer @marthe_x1 ?' })).toBeVisible();
    await expectNoAxeViolation(page);
  });
}

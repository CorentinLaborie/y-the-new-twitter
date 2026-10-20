import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// WCAG 2.2 AA (product doc, accessibility contract).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// The widths of the three landing boards: mobile 360, tablet 768, desktop 1440.
const BOARD_WIDTHS = [360, 768, 1440];

async function expectNoAxeViolation(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
}

test('the visitor landing on "/" has no WCAG 2.2 AA violation at the three board widths', async ({
  page,
}) => {
  for (const width of BOARD_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expectNoAxeViolation(page);
  }
});

test('the health page has no WCAG 2.2 AA violation', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByRole('status')).toBeVisible();

  await expectNoAxeViolation(page);
});

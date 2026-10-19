import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WCAG 2.2 AA (product doc, accessibility contract).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the home page has no WCAG 2.2 AA violation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

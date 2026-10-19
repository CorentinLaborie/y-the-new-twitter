import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthApi, ui } from './auth-kit';

// WCAG 2.2 AA (product doc, accessibility contract), as in accessibility.spec.ts.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Each auth screen, with the button that shows the page has finished loading.
const AUTH_SCREENS = [
  { name: 'signup', path: '/signup', ready: ui.submitSignup },
  { name: 'signup code', path: '/signup/code?email=alice%40example.com', ready: ui.submitCode },
  { name: 'login', path: '/login', ready: ui.submitLogin },
  { name: 'forgot password', path: '/forgot-password', ready: ui.submitForgot },
];

for (const screen of AUTH_SCREENS) {
  test(`the ${screen.name} page has no WCAG 2.2 AA violation`, async ({ page }) => {
    await mockAuthApi(page);
    await page.goto(screen.path);
    await expect(page.getByRole('button', { name: screen.ready, exact: true })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

    // Guard against an empty run: axe must have checked rules that passed.
    expect(results.passes.length).toBeGreaterThan(0);
    expect(results.violations).toEqual([]);
  });
}

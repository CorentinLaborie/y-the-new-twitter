import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockSettingsApi } from './settings-kit';

// The settings at 325 px wide (plan L5, section 7 and 8). Mocked API. Each page has no horizontal scroll, its buttons
// and links are at least 44 px high, and axe finds no WCAG 2.2 AA violation. This project runs only the settings specs.

const MIN_TOUCH_TARGET = 44;
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PAGES = ['/settings', '/settings/password', '/settings/email', '/settings/delete-account', '/settings/notifications'];

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectTouchTargets(page: Page) {
  const controls = page.getByRole('button').or(page.getByRole('link')).or(page.getByRole('switch'));
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) {
      continue;
    }
    const height = (await control.boundingBox())?.height ?? 0;
    expect(height, `control ${index}`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
}

for (const path of PAGES) {
  test(`at 325 px ${path} has no horizontal scroll, 44 px controls and no WCAG 2.2 AA violation`, async ({ page }) => {
    await page.setViewportSize({ width: 325, height: 640 });
    await mockSettingsApi(page, { notificationItems: [] });

    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
    expect(results.passes.length).toBeGreaterThan(0);
    expect(results.violations).toEqual([]);
  });
}

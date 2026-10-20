import { expect, test } from '@playwright/test';
import { givenPendingEmail, mockAuthApi } from './auth-kit';

// The Y mark of the Auth boards. The login board shows it on every breakpoint, phones included. The forgot-password
// first step shows it from tablet width only (its mobile board has none). The signup and code screens have no mark
// on their boards. The first mark of the page is the screen's own mark: the Y inside a button comes later in the page.
const SCREENS_WITH_MARK = [
  { path: '/login', markOnMobile: true },
  { path: '/forgot-password', markOnMobile: false },
];
const SCREENS_WITHOUT_MARK = ['/signup', '/signup/code'];

for (const { path, markOnMobile } of SCREENS_WITH_MARK) {
  test(`the Y mark follows the screen width on ${path}`, async ({ page }, testInfo) => {
    await mockAuthApi(page);
    await page.goto(path);

    const mark = page.locator('main svg.y-logo-mark').first();
    if (testInfo.project.name === 'mobile' && !markOnMobile) {
      await expect(mark).toBeHidden();
    } else {
      await expect(mark).toBeVisible();
    }
  });
}

for (const path of SCREENS_WITHOUT_MARK) {
  test(`${path} has no Y mark, as on its boards`, async ({ page }) => {
    await mockAuthApi(page);
    await givenPendingEmail(page, 'alice@example.com');
    await page.goto(path);

    await expect(page.locator('main svg.y-logo-mark')).toHaveCount(0);
  });
}

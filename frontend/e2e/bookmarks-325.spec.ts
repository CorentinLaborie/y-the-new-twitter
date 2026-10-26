import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockBookmarksApi } from './bookmarks-kit';
import { account, questionOf } from './profile-kit';

// The saved questions page at 325 px wide (plan L4, section 9.3). Mocked API. Runs in the mobile-325 project only.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the saved list fits 325 px: no horizontal scroll, and the save button keeps a 44 px target', async ({
  page,
}) => {
  const long = 'Une question assez longue pour passer à la ligne sur un petit écran';
  await mockBookmarksApi(page, {
    page: () => ({
      status: 200,
      body: {
        questions: [{ ...questionOf('b1', long, account('alice')), viewerSaved: true }],
        nextCursor: null,
      },
    }),
  });

  await page.goto('/bookmarks');

  await expect(page.getByText(long)).toBeVisible();
  await expectNoHorizontalScroll(page);
  const box = await page.getByRole('button', { name: 'Retirer des signets' }).boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

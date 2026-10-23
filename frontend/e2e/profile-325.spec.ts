import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockFeedApi, signIn } from './feed-kit';
import { account, mockProfileApi, profile, questionOf } from './profile-kit';

// The profile and its follow list at 325 px wide (L1, sections 7 and 8.4). Mocked API. WCAG 2.2 AA through axe.

const VIEWPORT = { width: 325, height: 700 };
const MIN_TOUCH_TARGET = 44;
const SIDE_GUTTER = 16;
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

test('at 325 px the profile keeps its name, counts and follow pill, with no horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({ status: 200, body: profile() }),
    questions: () => ({
      status: 200,
      body: {
        questions: [questionOf('p1', 'Question du profil mobile', account('marthe'))],
        nextCursor: null,
      },
    }),
  });

  await page.goto('/u/marthe');

  await expect(page.getByRole('heading', { name: 'Marthe Dupont' })).toBeVisible();
  const pill = page.getByRole('button', { name: 'Suivre @marthe' });
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(SIDE_GUTTER - 1);
  await expectNoHorizontalScroll(page);
});

test('at 325 px the profile has no WCAG 2.2 AA violation', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({ status: 200, body: profile() }),
  });

  await page.goto('/u/marthe');
  await expect(page.getByRole('heading', { name: 'Marthe Dupont' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('at 325 px the followers list keeps each row and its pill in the screen', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({ status: 200, body: profile() }),
    followers: () => ({ status: 200, body: { items: [account('bob', true)], nextCursor: null } }),
  });

  await page.goto('/u/marthe/followers');

  const pill = page.getByRole('button', { name: 'Suivi @bob' });
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(VIEWPORT.width);
  await expectNoHorizontalScroll(page);
});

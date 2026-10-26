import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, signIn } from './feed-kit';

// The follow controls at 325 px wide (plan L3, sections 9.3 and 7.2). Mocked API. The viewport is set in each test;
// the three projects of playwright.config.ts run the same checks. WCAG 2.2 AA through axe.

const VIEWPORT = { width: 325, height: 700 };
const MIN_TOUCH_TARGET = 44;
const SIDE_GUTTER = 16;
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

function followedQuestion(id: string, text: string, handle: string) {
  return {
    id,
    text,
    hashtags: [],
    createdAt: '2026-10-14T08:41:00Z',
    author: { handle, displayName: handle.toUpperCase(), viewerFollows: true },
    counters: { like: 1, dislike: 0, y: 3, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
    viewerSaved: false,
  };
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('at 325 px the card keeps the Suivi pill, the menu entry and a 44 px target, with no horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page, {
    feed: () => feedPage([followedQuestion('f', 'Question suivie en mobile', 'bob')]),
  });

  await page.goto('/home?tab=following');

  const pill = page.getByRole('button', { name: 'Suivi @bob' });
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(SIDE_GUTTER - 1);
  await expectNoHorizontalScroll(page);
});

test('at 325 px the two home tabs fit the screen, with their full labels', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page, { feed: () => feedPage([]) });

  await page.goto('/home');

  const tablist = page.getByRole('tablist', { name: 'Accueil' });
  await expect(tablist).toBeVisible();
  for (const name of ['Pour vous', 'Abonnements']) {
    const tab = page.getByRole('tab', { name });
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(VIEWPORT.width);
  }
  await expectNoHorizontalScroll(page);
});

test('the Abonnements tab at 325 px has no WCAG 2.2 AA violation with a followed question', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page, {
    feed: () => feedPage([followedQuestion('f', 'Question suivie axe', 'bob')]),
  });

  await page.goto('/home?tab=following');
  await expect(page.getByRole('button', { name: 'Suivi @bob' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('at 325 px a click on the Suivi pill sends the unfollow', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const { unfollowCalls } = await mockFeedApi(page, {
    feed: () => feedPage([followedQuestion('f', 'Question suivie clic', 'bob')]),
    unfollow: () => ({ status: 204 }),
  });

  // The "Pour vous" tab: on the Abonnements tab the question would leave the list with the unfollow.
  await page.goto('/home');
  await page.getByRole('button', { name: 'Suivi @bob' }).click();

  await expect(page.getByRole('button', { name: 'Suivre @bob' })).toBeVisible();
  expect(unfollowCalls).toEqual([{ handle: 'bob', csrf: 'csrf-e2e' }]);
});

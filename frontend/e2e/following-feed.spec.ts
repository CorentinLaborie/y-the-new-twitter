import { expect, test } from '@playwright/test';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';

// The "Abonnements" tab of the home page (L3, section 7.3), on the three screen sizes of the project.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

function followed(id: string, text: string, handle: string) {
  return {
    ...question(id, text),
    author: { handle, displayName: handle.toUpperCase(), viewerFollows: true },
  };
}

test('the Abonnements tab asks the following feed and shows the questions of the followed accounts', async ({
  page,
}) => {
  const { feedCalls } = await mockFeedApi(page, {
    feed: (call) =>
      call.tab === 'following'
        ? feedPage([followed('f', 'Question d’un compte suivi', 'bob')])
        : feedPage([question('a', 'Question du fil général')]),
  });

  await page.goto('/home');
  await page.getByRole('tab', { name: 'Abonnements' }).click();

  await expect(page.getByRole('tab', { name: 'Abonnements' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Question d’un compte suivi')).toBeVisible();
  expect(feedCalls.at(-1)?.tab).toBe('following');
  expect(page).toHaveURL(/\/home\?tab=following$/);
});

test('the URL opens the Abonnements tab directly', async ({ page }) => {
  await mockFeedApi(page, {
    feed: () => feedPage([followed('f', 'Question suivie directe', 'bob')]),
  });

  await page.goto('/home?tab=following');

  await expect(page.getByRole('tab', { name: 'Abonnements' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Question suivie directe')).toBeVisible();
});

test('an empty Abonnements tab shows its text and no action', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([]) });

  await page.goto('/home?tab=following');

  await expect(page.getByText('Les questions des comptes que vous suivez apparaîtront ici.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explorer' })).toHaveCount(0);
});

test('unfollowing an author on Abonnements takes their questions off the list at once', async ({ page }) => {
  const { unfollowCalls } = await mockFeedApi(page, {
    feed: () =>
      feedPage([
        followed('f', 'Question qui disparaît', 'bob'),
        followed('g', 'Question qui reste', 'carol'),
      ]),
    unfollow: () => ({ status: 204 }),
  });

  await page.goto('/home?tab=following');
  await expect(page.getByText('Question qui disparaît')).toBeVisible();

  await page.getByRole('button', { name: 'Plus d’options' }).first().click();
  await page.getByRole('menuitem', { name: 'Ne plus suivre @bob' }).click();

  await expect(page.getByText('Question qui disparaît')).toHaveCount(0);
  await expect(page.getByText('Question qui reste')).toBeVisible();
  expect(unfollowCalls).toEqual([{ handle: 'bob', csrf: 'csrf-e2e' }]);
});

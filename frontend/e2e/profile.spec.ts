import { expect, test, type Page } from '@playwright/test';
import { mockFeedApi, signIn } from './feed-kit';
import { account, mockProfileApi, profile, questionOf } from './profile-kit';

// The profile /u/[handle] and its follow lists (L1, L3 section 7.4), on the three screen sizes. Mocked API.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the profile shows the name, the handle, the bio, the date of joining, the counts and the questions', async ({
  page,
}) => {
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({ status: 200, body: profile() }),
    questions: () => ({
      status: 200,
      body: {
        questions: [questionOf('p1', 'Question publiée par Marthe', account('marthe'))],
        nextCursor: null,
      },
    }),
  });

  await page.goto('/u/marthe');

  await expect(page.getByRole('heading', { name: 'Marthe Dupont' })).toBeVisible();
  await expect(page.getByText('@marthe', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Curieuse de tout, je pose les questions que personne n’ose poser.'),
  ).toBeVisible();
  await expect(page.getByText('A rejoint Y en mars 2026')).toBeVisible();
  await expect(page.getByRole('link', { name: /182 abonnements/ })).toHaveAttribute(
    'href',
    '/u/marthe/following',
  );
  await expect(page.getByRole('link', { name: /abonnés$/ })).toHaveAttribute('href', '/u/marthe/followers');
  await expect(page.getByRole('button', { name: 'Suivre @marthe' })).toBeVisible();
  await expect(page.getByText('Question publiée par Marthe')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the viewer’s own profile shows no follow pill', async ({ page }) => {
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({
      status: 200,
      body: profile({ handle: 'corentin', displayName: 'Corentin', isOwnAccount: true }),
    }),
  });

  await page.goto('/u/corentin');

  await expect(page.getByRole('heading', { name: 'Corentin' })).toBeVisible();
  await expect(page.getByRole('button', { name: /@corentin$/ })).toHaveCount(0);
});

test('an account that is not visible shows the not-found page', async ({ page }) => {
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({ status: 404, body: { title: 'Introuvable', detail: 'Compte introuvable.' } }),
    questions: () => ({ status: 404, body: { title: 'Introuvable', detail: 'Compte introuvable.' } }),
  });

  await page.goto('/u/nobody');

  await expect(page.getByRole('heading', { name: 'Cette page n’existe pas' })).toBeVisible();
});

test('the followers list shows each account with its follow state', async ({ page }) => {
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({ status: 200, body: profile() }),
    followers: () => ({
      status: 200,
      body: { items: [account('bob', true), account('carol', false)], nextCursor: null },
    }),
  });

  await page.goto('/u/marthe/followers');

  await expect(page.getByRole('heading', { name: 'Abonnés' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compte bob' })).toHaveAttribute('href', '/u/bob');
  await expect(page.getByRole('button', { name: 'Suivi @bob' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suivre @carol' })).toBeVisible();
});

test('unfollowing from the following list turns the pill into Suivre', async ({ page }) => {
  await mockFeedApi(page);
  const { unfollowCalls } = await mockProfileApi(page, {
    profile: () => ({ status: 200, body: profile() }),
    following: () => ({ status: 200, body: { items: [account('bob', true)], nextCursor: null } }),
  });

  await page.goto('/u/marthe/following');
  await page.getByRole('button', { name: 'Suivi @bob' }).click();

  await expect(page.getByRole('button', { name: 'Suivre @bob' })).toBeVisible();
  expect(unfollowCalls).toEqual(['bob']);
});

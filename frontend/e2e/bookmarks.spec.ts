import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { mockBookmarksApi } from './bookmarks-kit';
import { account, questionOf } from './profile-kit';

// The saved questions page /bookmarks (L4, plan section 7), on the three screen sizes. Mocked API.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const alice = account('alice');
const bob = account('bob');

test('the page lists the saved questions, newest save first, each one marked as saved', async ({ page }) => {
  await mockBookmarksApi(page, {
    page: () => ({
      status: 200,
      body: {
        questions: [
          { ...questionOf('b1', 'Première sauvegardée', alice), viewerSaved: true },
          { ...questionOf('b2', 'Seconde sauvegardée', bob), viewerSaved: true },
        ],
        nextCursor: null,
      },
    }),
  });

  await page.goto('/bookmarks');

  await expect(page.getByRole('heading', { name: 'Signets' })).toBeVisible();
  await expect(page.getByText('Première sauvegardée')).toBeVisible();
  await expect(page.getByText('Seconde sauvegardée')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirer des signets' })).toHaveCount(2);
  await expectNoHorizontalScroll(page);
});

test('an empty list says what it holds and how to fill it', async ({ page }) => {
  await mockBookmarksApi(page, { page: () => ({ status: 200, body: { questions: [], nextCursor: null } }) });

  await page.goto('/bookmarks');

  await expect(page.getByRole('heading', { name: 'Aucune question enregistrée' })).toBeVisible();
  await expect(page.getByText('Enregistrez une question pour la retrouver ici.')).toBeVisible();
});

test('unsaving a question sends DELETE and takes it off the list at once', async ({ page }) => {
  const calls = await mockBookmarksApi(page, {
    page: () => ({
      status: 200,
      body: {
        questions: [
          { ...questionOf('b1', 'À retirer', alice), viewerSaved: true },
          { ...questionOf('b2', 'À garder', bob), viewerSaved: true },
        ],
        nextCursor: null,
      },
    }),
  });
  await page.goto('/bookmarks');
  await expect(page.getByText('À retirer')).toBeVisible();

  await page.getByRole('button', { name: 'Retirer des signets' }).first().click();

  await expect(page.getByText('À retirer')).toHaveCount(0);
  await expect(page.getByText('À garder')).toBeVisible();
  expect(calls.unsaved).toEqual(['b1']);
});

test('"Voir plus" loads the next page with its cursor and adds it after the first one', async ({ page }) => {
  const calls = await mockBookmarksApi(page, {
    page: (cursor) =>
      cursor === null
        ? {
            status: 200,
            body: {
              questions: [{ ...questionOf('b1', 'Page un', alice), viewerSaved: true }],
              nextCursor: 'c1',
            },
          }
        : {
            status: 200,
            body: {
              questions: [{ ...questionOf('b2', 'Page deux', bob), viewerSaved: true }],
              nextCursor: null,
            },
          },
  });
  await page.goto('/bookmarks');
  await expect(page.getByText('Page un')).toBeVisible();

  await page.getByRole('button', { name: 'Voir plus', exact: true }).click();

  await expect(page.getByText('Page deux')).toBeVisible();
  expect(calls.cursors).toEqual([null, 'c1']);
  await expect(page.getByRole('button', { name: 'Voir plus', exact: true })).toHaveCount(0);
});

test('the search sends the text, the list shows the matches and the header gives the total', async ({ page }) => {
  const calls = await mockBookmarksApi(page, {
    page: (_cursor, search) => ({
      status: 200,
      body: {
        questions: [
          search === 'vélo'
            ? { ...questionOf('b1', 'Le vélo en ville', alice), viewerSaved: true }
            : { ...questionOf('b2', 'Recette du pain', bob), viewerSaved: true },
        ],
        nextCursor: null,
        total: 4,
      },
    }),
  });

  await page.goto('/bookmarks');

  await expect(page.getByText('4 questions enregistrées')).toBeVisible();
  await page.getByLabel('Rechercher dans vos signets').fill('vélo');
  await page.getByRole('button', { name: 'Rechercher' }).click();

  await expect(page.getByText('Le vélo en ville')).toBeVisible();
  await expect(page.getByText('Recette du pain')).toHaveCount(0);
  expect(calls.searches).toContain('vélo');
  await expectNoHorizontalScroll(page);
});

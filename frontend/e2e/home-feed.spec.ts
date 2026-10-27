import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { notice } from './auth-kit';
import { feedPage, mockFeedApi, problemReply, question, signIn } from './feed-kit';

// WCAG 2.2 AA (product doc, accessibility contract).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const COMPOSER_LABEL = 'Posez votre question';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// The questions of the feed only: the trending block and the navigation are lists too.
function feedItems(page: Page) {
  return page.getByRole('list', { name: 'Questions du fil' }).getByRole('listitem');
}

test('the list shows the questions of the feed, with author, handle, date, hashtags and text', async ({
  page,
}) => {
  await mockFeedApi(page, {
    feed: () =>
      feedPage([
        question('a', 'Pourquoi les gens préfèrent-ils les réponses rapides ?', ['online_life']),
        question('b', 'Faut-il attendre le lundi pour commencer ?', ['human_life']),
      ]),
  });

  await page.goto('/home');

  const items = feedItems(page);
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Pourquoi les gens préfèrent-ils les réponses rapides ?');
  await expect(items.nth(0)).toContainText('Marthe A');
  await expect(items.nth(0)).toContainText('@marthe_a');
  await expect(items.nth(0)).toContainText('14/10/2026 10h41');
  await expect(items.nth(0)).toContainText('#online_life');
  await expect(items.nth(1)).toContainText('Faut-il attendre le lundi pour commencer ?');
  await expectNoHorizontalScroll(page);
});

test('a question posted from the composer appears first, after the API created it', async ({ page }) => {
  const created = question('new', 'Pourquoi le café refroidit-il si vite ?', ['irl_vs_online']);
  const { postCalls } = await mockFeedApi(page, {
    feed: () => feedPage([question('a', 'Une question déjà publiée')]),
    post: () => ({ status: 201, body: created }),
  });

  await page.goto('/home');
  await expect(feedItems(page)).toHaveCount(1);

  await page.getByLabel(COMPOSER_LABEL).fill('  Pourquoi le café refroidit-il si vite ?  ');
  await page.getByRole('button', { name: 'Poster' }).click();

  const items = feedItems(page);
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Pourquoi le café refroidit-il si vite ?');
  await expect(items.nth(1)).toContainText('Une question déjà publiée');
  await expect(page.getByLabel(COMPOSER_LABEL)).toHaveValue('');

  // The text is sent trimmed, with the CSRF token of the cookie and an Idempotency-Key.
  expect(postCalls).toHaveLength(1);
  expect(postCalls[0]?.body).toEqual({ text: 'Pourquoi le café refroidit-il si vite ?' });
  expect(postCalls[0]?.csrf).toBe('csrf-e2e');
  expect(postCalls[0]?.idempotencyKey).toBeTruthy();
});

test('a text over 280 characters is refused on the page and is not sent', async ({ page }) => {
  const { postCalls } = await mockFeedApi(page, { feed: () => feedPage([]) });

  await page.goto('/home');
  await page.getByLabel(COMPOSER_LABEL).fill('a'.repeat(281));

  await expect(page.getByText('Votre question dépasse 280 caractères.')).toBeVisible();
  await expect(page.getByText('281/280')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Poster' })).toBeDisabled();
  expect(postCalls).toHaveLength(0);
});

test('the empty state shows when the feed has no question', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([]) });

  await page.goto('/home');

  await expect(page.getByRole('heading', { name: 'Rien à lire pour l’instant' })).toBeVisible();
  await expect(page.getByText('Posez la première question ou explorez les tendances.')).toBeVisible();
  // The empty state offers the way to Explorer (DEC-168, restored with the /explore page in M4).
  await expect(page.getByRole('main').getByRole('link', { name: 'Explorer' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('new questions are announced by a pill, and shown first when it is clicked', async ({ page }) => {
  // The check of new questions runs every 30 seconds: the clock of the page is controlled here.
  await page.clock.install();
  let calls = 0;
  await mockFeedApi(page, {
    feed: () => {
      calls += 1;
      return calls === 1
        ? feedPage([question('a', 'Question déjà affichée')])
        : feedPage([
            question('b', 'Question arrivée pendant la lecture'),
            question('a', 'Question déjà affichée'),
          ]);
    },
  });

  await page.goto('/home');
  await expect(feedItems(page)).toHaveCount(1);
  await page.clock.fastForward(30_000);

  const pill = page.getByRole('button', { name: 'Afficher 1 nouvelle question' });
  await expect(pill).toBeVisible();
  await pill.click();

  await expect(feedItems(page)).toHaveCount(2);
  await expect(feedItems(page).nth(0)).toContainText('Question arrivée pendant la lecture');
  await expect(pill).toHaveCount(0);
});

test('the loading state shows until the feed answers', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockFeedApi(page, {
    feed: async () => {
      await gate;
      return feedPage([question('a', 'Question chargée après l’attente')]);
    },
  });

  await page.goto('/home');

  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Chargement…' })).toHaveCount(3);

  release();
  await expect(page.getByText('Question chargée après l’attente')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('the error state shows, and Réessayer loads the feed again', async ({ page }) => {
  let attempts = 0;
  const { feedCalls } = await mockFeedApi(page, {
    feed: () => {
      attempts += 1;
      return attempts === 1
        ? problemReply(500, 'Erreur serveur.')
        : feedPage([question('a', 'Question reçue à la deuxième tentative')]);
    },
  });

  await page.goto('/home');

  await expect(notice(page)).toContainText('Impossible de charger le fil');
  await page.getByRole('button', { name: 'Réessayer' }).click();

  await expect(page.getByText('Question reçue à la deuxième tentative')).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  expect(feedCalls).toHaveLength(2);
});

test('Voir plus loads the next page and keeps the questions already shown', async ({ page }) => {
  const { feedCalls } = await mockFeedApi(page, {
    feed: ({ cursor }) =>
      cursor === 'page-2'
        ? feedPage([question('b', 'Question de la deuxième page')], null)
        : feedPage([question('a', 'Question de la première page')], 'page-2'),
  });

  await page.goto('/home');
  await page.getByRole('button', { name: 'Voir plus', exact: true }).click();

  await expect(feedItems(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Voir plus', exact: true })).toHaveCount(0);
  expect(feedCalls.map((call) => call.cursor)).toEqual([null, 'page-2']);
});

test('the list of questions has no WCAG 2.2 AA violation', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([question('a', 'Une question pour le contrôle')]) });

  await page.goto('/home');
  await expect(feedItems(page)).toHaveCount(1);

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

test('the empty state has no WCAG 2.2 AA violation', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([]) });

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Rien à lire pour l’instant' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

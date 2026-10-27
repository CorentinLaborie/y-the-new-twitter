import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { corsHeaders } from './profile-kit';

// The Explore screens (M4): /explore (trends, popular questions, suggested accounts, search) and /hashtags/{tag}.
// Mocked API, on the four sizes of the project (desktop, tablet, mobile, mobile-325).

const API_ORIGIN = 'http://localhost:8080';

const QUESTION = {
  id: '4c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f',
  text: 'Quelle est la meilleure façon de tester #tests ?',
  hashtags: ['tests'],
  createdAt: '2026-10-27T10:00:00.000Z',
  author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
  counters: { like: 2, dislike: 0, y: 4, reply: 0 },
  yThreshold: 50,
  conversationOpen: false,
  viewerReactions: [],
  viewerSaved: false,
};

type Reply = { status: number; body: unknown };

type ExploreHandlers = {
  trends: () => Reply;
  popular: () => Reply;
  suggestions: () => Reply;
  search: (text: string) => Reply;
  hashtag: (tag: string) => Reply;
};

const DEFAULT_HANDLERS: ExploreHandlers = {
  trends: () => ({ status: 200, body: { hashtags: [{ name: 'tests', reactions: 3 }] } }),
  popular: () => ({ status: 200, body: { questions: [QUESTION] } }),
  suggestions: () => ({
    status: 200,
    body: { accounts: [{ id: 'a-1', handle: 'carol', displayName: 'Carol' }] },
  }),
  search: () => ({ status: 200, body: { questions: [], hashtags: [], accounts: [] } }),
  hashtag: () => ({ status: 200, body: { questions: [QUESTION], nextCursor: null } }),
};

/** Mocks the Explore calls. Every other call falls through to the other mocks of the test. */
async function mockExploreApi(page: Page, overrides: Partial<ExploreHandlers> = {}): Promise<void> {
  const handlers: ExploreHandlers = { ...DEFAULT_HANDLERS, ...overrides };

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    const origin = request.headers()['origin'];
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const path = url.pathname;
    const hashtag = /^\/api\/v1\/hashtags\/([^/]+)\/questions$/.exec(path);
    let reply: Reply | null = null;

    if (path === '/api/v1/explore/trends') reply = handlers.trends();
    else if (path === '/api/v1/explore/popular') reply = handlers.popular();
    else if (path === '/api/v1/explore/suggestions') reply = handlers.suggestions();
    else if (path === '/api/v1/search') reply = handlers.search(url.searchParams.get('q') ?? '');
    else if (hashtag) reply = handlers.hashtag(decodeURIComponent(hashtag[1] ?? ''));

    if (reply === null) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: corsHeaders(origin),
      body: JSON.stringify(reply.body),
    });
  });
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('Explorer shows the trends, the popular questions and the accounts to follow, without horizontal scroll', async ({
  page,
}) => {
  await mockExploreApi(page);

  await page.goto('/explore');

  await expect(
    page.getByRole('region', { name: 'Tendances' }).getByRole('link', { name: /#tests/ }),
  ).toBeVisible();
  await expect(page.getByText('3 réactions sur 24 h')).toBeVisible();
  await expect(page.getByText('Quelle est la meilleure façon de tester #tests ?')).toBeVisible();
  await expect(page.getByRole('link', { name: /Carol/ })).toHaveAttribute('href', '/u/carol');
  // Each hashtag of a question card leads to its page.
  await expect(page.getByRole('main').getByRole('link', { name: '#tests' }).first()).toHaveAttribute(
    'href',
    '/hashtags/tests',
  );
  await expectNoHorizontalScroll(page);
});

test('a search keeps its text in the address and shows the hashtags and accounts found', async ({ page }) => {
  await mockExploreApi(page, {
    search: (text) =>
      text === 'tests'
        ? {
            status: 200,
            body: {
              questions: [],
              hashtags: [{ name: 'tests' }],
              accounts: [{ handle: 'bob', displayName: 'Bob' }],
            },
          }
        : { status: 200, body: { questions: [], hashtags: [], accounts: [] } },
  });

  await page.goto('/explore');
  await page.getByRole('searchbox').fill('tests');
  await page.getByRole('button', { name: 'Rechercher' }).click();

  await expect(page).toHaveURL(/\/explore\?q=tests$/);
  await expect(
    page.getByRole('list', { name: 'Hashtags trouvés' }).getByRole('link', { name: '#tests' }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Comptes trouvés' }).getByRole('link', { name: /Bob/ }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a hashtag page lists its questions', async ({ page }) => {
  await mockExploreApi(page);

  await page.goto('/hashtags/tests');

  const title = page.getByRole('heading', { name: '#tests' });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('padding-top', '8px');
  // On desktop (1024 px and more) the title also moves 8 px to the right.
  await expect(title).toHaveCSS('padding-left', test.info().project.name === 'desktop' ? '8px' : '0px');
  await expect(page.getByText('Quelle est la meilleure façon de tester #tests ?')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

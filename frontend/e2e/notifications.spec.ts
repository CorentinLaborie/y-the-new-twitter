import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';

// Notifications page (plan L2, sections 6 and 8.4). Mocked API, on the three viewports of playwright.config.ts
// (desktop, tablet, mobile). The protected page is served by e2e/session-stub.mjs for the e2e session cookie.

const API_ORIGIN = 'http://localhost:8080';
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const NOTIFICATION_LIST = '[role="tabpanel"] ol';
const READ_PREFIX = /^Non lue : /;

type Reply = { status: number; body?: unknown };
type ListCall = { type: string | null; cursor: string | null };
type NotificationJson = {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  actor: { handle: string; displayName: string } | null;
  actorCount: number;
  question: { id: string; text: string } | null;
  reply: null;
};
type Handlers = {
  list?: (call: ListCall) => Reply | Promise<Reply>;
  unread?: () => Reply;
  readAll?: () => Reply;
  session?: 'active' | 'suspended';
};

function line(id: string, overrides: Partial<NotificationJson> = {}): NotificationJson {
  return {
    id,
    type: 'reply_to_question',
    createdAt: '2026-10-22T08:00:00.000Z',
    readAt: null,
    actor: { handle: `marthe_${id}`, displayName: `Marthe ${id.toUpperCase()}` },
    actorCount: 1,
    question: { id: `q-${id}`, text: `Question ${id}` },
    reply: null,
    ...overrides,
  };
}

const ok = (items: NotificationJson[], nextCursor: string | null = null): Reply => ({
  status: 200,
  body: { items, nextCursor },
});

const serverError: Reply = {
  status: 500,
  body: { type: 'about:blank', title: 'Erreur', status: 500, detail: 'Erreur serveur.' },
};

// Answers the calls of the page and records the list calls. Unknown calls get a 404, so that a missing reply fails visibly.
async function mockNotificationsApi(page: Page, handlers: Handlers = {}) {
  const listCalls: ListCall[] = [];
  const readAllCsrf: (string | null)[] = [];

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    const cors: Record<string, string> = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, x-csrf-token, idempotency-key',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    let reply: Reply = { status: 404, body: { title: `Aucune réponse simulée pour ${request.method()} ${path}` } };

    if (request.method() === 'GET' && path === '/notifications') {
      const call: ListCall = { type: url.searchParams.get('type'), cursor: url.searchParams.get('cursor') };
      listCalls.push(call);
      reply = handlers.list ? await handlers.list(call) : ok([]);
    } else if (request.method() === 'GET' && path === '/notifications/unread-count') {
      reply = handlers.unread ? handlers.unread() : { status: 200, body: { unread: 0 } };
    } else if (request.method() === 'POST' && path === '/notifications/read-all') {
      readAllCsrf.push(request.headers()['x-csrf-token'] ?? null);
      reply = handlers.readAll ? handlers.readAll() : { status: 204 };
    } else if (request.method() === 'GET' && path === '/auth/session') {
      const status = handlers.session ?? 'active';
      reply = { status: 200, body: { user: { handle: 'alice', displayName: 'Alice Martin', status } } };
    } else if (request.method() === 'GET' && path === '/status') {
      reply = { status: 200, body: { status: 'ok' } };
    }

    await route.fulfill({
      status: reply.status,
      headers: cors,
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });

  return { listCalls, readAllCsrf };
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

function markAllButton(page: Page) {
  return page.getByRole('button', { name: 'Tout marquer comme lu' });
}

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('the page shows its title, the two tabs, the lines and the navigation entry at this width', async ({ page }) => {
  await mockNotificationsApi(page, { list: () => ok([line('a'), line('b', { readAt: '2026-10-22T08:05:00.000Z' })]) });

  await page.goto('/notifications');

  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Toutes' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('an unread line is named « Non lue : », a read line is not', async ({ page }) => {
  await mockNotificationsApi(page, {
    list: () => ok([line('a'), line('b', { readAt: '2026-10-22T08:05:00.000Z' })]),
    readAll: () => ({ status: 500, body: serverError.body }),
  });

  await page.goto('/notifications');

  await expect(page.getByRole('link', { name: READ_PREFIX })).toHaveCount(1);
  await expect(page.getByRole('link', { name: READ_PREFIX })).toContainText('Marthe A');
  await expect(page.getByRole('link', { name: /Marthe B/ })).not.toHaveAccessibleName(READ_PREFIX);
});

test('opening the page calls the read endpoint once, and the navigation badge goes to 0', async ({ page }) => {
  const { readAllCsrf } = await mockNotificationsApi(page, {
    list: () => ok([line('a'), line('b')]),
    unread: () => ({ status: 200, body: { unread: 3 } }),
  });

  await page.goto('/notifications');

  // The badge is 3 until the read call answers; the reset then takes it to 0 without a reload.
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await expect.poll(() => readAllCsrf.length).toBe(1);
  // The read call carries the CSRF token of the cookie.
  expect(readAllCsrf[0]).toBe('csrf-e2e');
});

test('Tout marquer comme lu marks every line as read and takes the badge to 0', async ({ page }) => {
  let readAllCount = 0;
  const { readAllCsrf } = await mockNotificationsApi(page, {
    list: () => ok([line('a'), line('b')]),
    unread: () => ({ status: 200, body: { unread: 3 } }),
    // The read call made when the page opens fails: the badge keeps its count until the visitor acts.
    readAll: () => {
      readAllCount += 1;
      return readAllCount === 1 ? { status: 500, body: serverError.body } : { status: 204 };
    },
  });

  await page.goto('/notifications');

  await expect(page.getByRole('link', { name: 'Notifications, 3 non lues' })).toBeVisible();
  await expect(page.getByRole('link', { name: READ_PREFIX })).toHaveCount(2);

  await markAllButton(page).click();

  await expect(page.getByRole('link', { name: READ_PREFIX })).toHaveCount(0);
  await expect(markAllButton(page)).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  expect(readAllCsrf).toHaveLength(2);
});

test('the Mentions tab asks the mentions, and the tab stays in the URL after a reload', async ({ page }) => {
  const { listCalls } = await mockNotificationsApi(page, {
    list: (call) =>
      call.type === 'mention'
        ? ok([line('m', { type: 'mention' })])
        : ok([line('a')]),
  });

  await page.goto('/notifications');
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Mentions' }).click();

  await expect(page).toHaveURL(/\/notifications\?tab=mention$/);
  await expect(page.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem').first()).toContainText('vous a mentionné');
  expect(listCalls.at(-1)).toEqual({ type: 'mention', cursor: null });

  await page.reload();

  await expect(page.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem').first()).toContainText('vous a mentionné');
  expect(listCalls.at(-1)).toEqual({ type: 'mention', cursor: null });
});

test('the arrow keys move from the Toutes tab to the Mentions tab', async ({ page }) => {
  await mockNotificationsApi(page, { list: () => ok([line('a')]) });

  await page.goto('/notifications');
  await page.getByRole('tab', { name: 'Toutes' }).focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/notifications\?tab=mention$/);
});

test('the empty state of each tab has a title and a text, and no action', async ({ page }) => {
  await mockNotificationsApi(page, { list: () => ok([]) });

  await page.goto('/notifications');

  await expect(page.getByRole('heading', { name: 'Aucune notification' })).toBeVisible();
  await expect(page.getByText('Vos notifications apparaîtront ici.')).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('tabpanel').getByRole('link')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Mentions' }).click();

  await expect(page.getByRole('heading', { name: 'Aucune notification' })).toBeVisible();
  await expect(
    page.getByText('Les mentions de votre pseudo dans les questions et les réponses apparaîtront ici.'),
  ).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('tabpanel').getByRole('link')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('the error state shows Réessayer, which loads the page again', async ({ page }) => {
  let calls = 0;
  await mockNotificationsApi(page, {
    list: () => {
      calls += 1;
      return calls === 1 ? serverError : ok([line('a')]);
    },
  });

  await page.goto('/notifications');

  await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Réessayer' }).click();

  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les notifications' })).toHaveCount(0);
});

test('Voir plus adds the next page, and the button goes when there is no next page', async ({ page }) => {
  const { listCalls } = await mockNotificationsApi(page, {
    list: (call) =>
      call.cursor === 'page-2' ? ok([line('c')]) : ok([line('a'), line('b')], 'page-2'),
  });

  await page.goto('/notifications');
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: 'Voir plus' }).click();

  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(3);
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem').nth(2)).toContainText('Question c');
  await expect(page.getByRole('button', { name: 'Voir plus' })).toHaveCount(0);
  expect(listCalls.at(-1)).toEqual({ type: null, cursor: 'page-2' });
});

test('a failed Voir plus keeps the lines shown and leaves the button available', async ({ page }) => {
  await mockNotificationsApi(page, {
    list: (call) => (call.cursor === 'page-2' ? serverError : ok([line('a'), line('b')], 'page-2')),
  });

  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Voir plus' }).click();

  await expect(page.getByText('Vérifiez votre connexion, puis réessayez.')).toBeVisible();
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Voir plus' })).toBeEnabled();
});

test('a line opens its question', async ({ page }) => {
  await mockNotificationsApi(page, { list: () => ok([line('a')]) });

  await page.goto('/notifications');

  await expect(page.locator(NOTIFICATION_LIST).getByRole('link').first()).toHaveAttribute('href', '/questions/q-a');
});

test('a suspended account sees the banner and an empty list', async ({ page }) => {
  await mockNotificationsApi(page, { session: 'suspended', list: () => ok([]) });

  await page.goto('/notifications');

  await expect(page.getByText('Votre compte est suspendu.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aucune notification' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voir plus' })).toHaveCount(0);
});

test('the page has no WCAG 2.2 AA violation with lines, tabs and the header action', async ({ page }) => {
  await mockNotificationsApi(page, {
    list: () => ok([line('a'), line('b', { readAt: '2026-10-22T08:05:00.000Z' })], 'page-2'),
    readAll: () => ({ status: 500, body: serverError.body }),
  });

  await page.goto('/notifications');
  await expect(page.locator(NOTIFICATION_LIST).getByRole('listitem')).toHaveCount(2);

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

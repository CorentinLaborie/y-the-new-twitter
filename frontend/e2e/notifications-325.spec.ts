import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './feed-kit';

// Notifications page and navigation at 325 px wide (plan L2, sections 7 and 8.4). Mocked API. The viewport is set in
// each test; the three projects of playwright.config.ts run the same checks.

const API_ORIGIN = 'http://localhost:8080';
const MIN_TOUCH_TARGET = 44;
const SIDE_GUTTER = 16;
const VIEWPORT = { width: 325, height: 700 };

type Reply = { status: number; body?: unknown };
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

function line(id: string, text: string): NotificationJson {
  return {
    id,
    type: 'reply_to_question',
    createdAt: '2026-10-22T08:00:00.000Z',
    readAt: null,
    actor: { handle: `marthe_${id}`, displayName: `Marthe ${id.toUpperCase()}` },
    actorCount: 1,
    question: { id: `q-${id}`, text },
    reply: null,
  };
}

const serverError: Reply = {
  status: 500,
  body: { type: 'about:blank', title: 'Erreur', status: 500, detail: 'Erreur serveur.' },
};

// The list, the unread count and the read call. Opening the page calls the read endpoint: its reply is set per test,
// a failed reply keeps the badge at its count (the page does not reset it).
async function mockNotificationsApi(
  page: Page,
  handlers: { list: (cursor: string | null) => Reply; unread?: number; readAll?: Reply },
) {
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
      reply = handlers.list(url.searchParams.get('cursor'));
    } else if (request.method() === 'GET' && path === '/notifications/unread-count') {
      reply = { status: 200, body: { unread: handlers.unread ?? 0 } };
    } else if (request.method() === 'POST' && path === '/notifications/read-all') {
      reply = handlers.readAll ?? { status: 204 };
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
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} is rendered`).not.toBeNull();
  return box!;
}

// Every visible block of the page keeps the 16 px gutter on both sides.
async function expectInGutter(locator: Locator, label: string) {
  const box = await expectBox(locator, label);
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(SIDE_GUTTER - 1);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(VIEWPORT.width - SIDE_GUTTER + 1);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await expectBox(locator, label);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
}

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize(VIEWPORT);
});

test('the page fits 325 px: no horizontal scroll and a 16 px gutter on the title, the list and the header action', async ({
  page,
}) => {
  await mockNotificationsApi(page, {
    list: () => ({
      status: 200,
      body: {
        items: [
          line('a', 'Pourquoi les gens préfèrent-ils les réponses rapides quand la question est longue et précise ?'),
          // A token without a space: the line must still wrap inside the screen.
          line('b', 'x'.repeat(80)),
          line('c', 'Courte question'),
        ],
        nextCursor: null,
      },
    }),
    unread: 3,
  });

  await page.goto('/notifications');

  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('listitem')).toHaveCount(3);
  await expectNoHorizontalScroll(page);
  await expectInGutter(page.getByRole('heading', { level: 1, name: 'Notifications' }), 'title');
  // The tab bar runs edge to edge, as the home tabs do: it must fit the screen, its labels keep the gutter.
  const tabs = await expectBox(page.getByRole('tablist'), 'tabs');
  expect(tabs.x, 'tabs left edge').toBeGreaterThanOrEqual(0);
  expect(tabs.x + tabs.width, 'tabs right edge').toBeLessThanOrEqual(VIEWPORT.width);
  await expectInGutter(page.locator('[role="tabpanel"] ol'), 'list');
  await expectInGutter(page.getByRole('button', { name: 'Tout marquer comme lu' }), 'header action');
});

test('the tabs, the lines, Voir plus and the header action are at least 44 px high', async ({ page }) => {
  await mockNotificationsApi(page, {
    list: (cursor) =>
      cursor === 'page-2'
        ? { status: 200, body: { items: [line('c', 'Question c')], nextCursor: null } }
        : { status: 200, body: { items: [line('a', 'Question a'), line('b', 'Question b')], nextCursor: 'page-2' } },
    unread: 2,
    readAll: { status: 500, body: serverError.body },
  });

  await page.goto('/notifications');
  await expect(page.locator('[role="tabpanel"] ol').getByRole('listitem')).toHaveCount(2);

  for (const tab of ['Toutes', 'Mentions']) {
    await expectTouchTarget(page.getByRole('tab', { name: tab }), `tab ${tab}`);
  }
  await expectTouchTarget(page.locator('[role="tabpanel"] ol').getByRole('link').nth(0), 'first line');
  await expectTouchTarget(page.locator('[role="tabpanel"] ol').getByRole('link').nth(1), 'second line');
  await expectTouchTarget(page.getByRole('button', { name: 'Tout marquer comme lu' }), 'header action');
  await expectTouchTarget(page.getByRole('button', { name: 'Voir plus' }), 'Voir plus');
});

test('the bottom bar entries are at least 44 px, do not scroll, and the Notifications badge is visible', async ({
  page,
}) => {
  // The read call fails, so the badge keeps its count while the page is open.
  await mockNotificationsApi(page, {
    list: () => ({ status: 200, body: { items: [line('a', 'Question a')], nextCursor: null } }),
    unread: 3,
    readAll: { status: 500, body: serverError.body },
  });

  await page.goto('/notifications');

  const bar = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(bar).toBeVisible();
  const entries = bar.getByRole('link');
  await expect(entries.first()).toBeVisible();
  for (let index = 0; index < (await entries.count()); index += 1) {
    await expectTouchTarget(entries.nth(index), `bar entry ${index + 1}`);
  }
  await expectTouchTarget(bar.getByRole('button'), 'more entry');
  expect(await bar.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);

  const notifications = bar.getByRole('link', { name: 'Notifications, 3 non lues' });
  await expect(notifications).toBeVisible();
  await expect(notifications.getByText('3', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the 99+ badge stays inside its bottom bar entry at 325 px', async ({ page }) => {
  await mockNotificationsApi(page, {
    list: () => ({ status: 200, body: { items: [line('a', 'Question a')], nextCursor: null } }),
    unread: 120,
    readAll: { status: 500, body: serverError.body },
  });

  await page.goto('/notifications');

  const bar = page.getByRole('navigation', { name: 'Navigation principale' });
  const entry = bar.getByRole('link', { name: 'Notifications, 120 non lues' });
  await expect(entry).toBeVisible();
  const badge = entry.getByText('99+', { exact: true });
  await expect(badge).toBeVisible();

  const entryBox = await expectBox(entry, 'Notifications entry');
  const badgeBox = await expectBox(badge, 'badge');
  expect(badgeBox.x).toBeGreaterThanOrEqual(entryBox.x - 1);
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(entryBox.x + entryBox.width + 1);
  await expectNoHorizontalScroll(page);
});

test('the empty state fits 325 px and has no action', async ({ page }) => {
  await mockNotificationsApi(page, { list: () => ({ status: 200, body: { items: [], nextCursor: null } }) });

  await page.goto('/notifications');

  await expect(page.getByRole('heading', { name: 'Aucune notification' })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('tabpanel').getByRole('link')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectInGutter(page.getByRole('heading', { name: 'Aucune notification' }), 'empty title');
});

test('the error state fits 325 px and Réessayer is at least 44 px high', async ({ page }) => {
  await mockNotificationsApi(page, { list: () => serverError });

  await page.goto('/notifications');

  const retry = page.getByRole('button', { name: 'Réessayer' });
  await expect(retry).toBeVisible();
  await expectTouchTarget(retry, 'Réessayer');
  await expectNoHorizontalScroll(page);
  await expectInGutter(page.getByRole('alert').filter({ hasText: 'Impossible de charger les notifications' }), 'error state');
});

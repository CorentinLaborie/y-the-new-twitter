import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_COOKIE, mockAdminApi, adminProblem, type AdminCall } from './admin-kit';

// Back-office screens (admin 1d), on the desktop size only: the back-office has no tablet or mobile layout.
// The API is simulated; the server-side guard reads the cookie SESSION=e2e-admin through the session stub.

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

const ACCOUNT = {
  id: ALICE_ID,
  handle: 'AliceY',
  displayName: 'Alice',
  status: 'active',
  role: 'user',
  maskedEmail: 'a***@d***.fr',
  createdAt: '2026-09-03T10:00:00.000Z',
};

const LOGIN_ENTRY = {
  id: 'e1',
  actorId: ADMIN_ID,
  action: 'auth.admin_login',
  result: 'ok',
  targetType: 'user',
  targetId: ADMIN_ID,
  reason: null,
  details: null,
  createdAt: '2026-10-16T08:12:00.000Z',
};

const FAILED_ENTRY = {
  ...LOGIN_ENTRY,
  id: 'e2',
  action: 'user.suspend',
  result: 'failed',
  reason: 'Code incorrect',
  createdAt: '2026-10-15T17:30:00.000Z',
};

const ACCOUNT_VIEW = {
  ...ACCOUNT,
  statusChangedAt: null,
  suspensionReason: null,
  lastLoginAt: '2026-10-16T08:12:00.000Z',
  activeSessionCount: 2,
  reports: { total: 0, open: 0 },
  moderatedContentCount: 0,
  history: [LOGIN_ENTRY],
};

// The notice of a form. Next.js adds its own role="alert" announcer to every page, so it is excluded.
function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}


test.describe('back-office', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The back-office is desktop only.');
  });

  test('without an administrator session, a page of the console sends the visitor to the login screen', async ({
    page,
  }) => {
    await page.goto('/admin/users');

    await page.waitForURL((url) => url.pathname === '/admin/login');
    await expect(page.getByRole('heading', { name: 'Connexion au back-office' })).toBeVisible();
  });

  test('the login opens the dashboard with the latest actions', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    await mockAdminApi(page, {
      'POST /admin/login': { status: 200, body: { status: 'ok', user: { handle: 'admin', displayName: 'Administrateur' } } },
      'GET /admin/audit-log': { status: 200, body: { items: [LOGIN_ENTRY], nextCursor: null } },
    });
    await page.goto('/admin/login');

    await page.getByLabel('Adresse e-mail').fill('admin@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.waitForURL((url) => url.pathname === '/admin');
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    await expect(page.getByText('Connexion administrateur')).toBeVisible();
  });

  test('a wrong password keeps the form open and shows the API message', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    await mockAdminApi(page, {
      'POST /admin/login': adminProblem(401, 'Identifiants incorrects'),
    });
    await page.goto('/admin/login');

    await page.getByLabel('Adresse e-mail').fill('admin@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Mauvais1234!');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(formAlert(page)).toContainText('Identifiants incorrects');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('after too many failures the form is locked for the Retry-After delay', async ({ page }) => {
    await mockAdminApi(page, {
      'POST /admin/login': adminProblem(429, 'Trop de tentatives.', { 'retry-after': '892' }),
    });
    await page.goto('/admin/login');

    await page.getByLabel('Adresse e-mail').fill('admin@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByText('Connexion bloquée')).toBeVisible();
    await expect(formAlert(page)).toContainText('Réessayez dans 14 min 52 s.');
    await expect(page.getByLabel('Mot de passe', { exact: true })).toBeDisabled();
  });

  test('the account search lists the accounts, and an account opens its view', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    const calls = await mockAdminApi(page, {
      'GET /admin/users': (call: AdminCall) =>
        call.search.includes('q=alice')
          ? { status: 200, body: { items: [ACCOUNT], nextCursor: null } }
          : { status: 200, body: { items: [], nextCursor: null } },
      [`GET /admin/users/${ALICE_ID}`]: { status: 200, body: ACCOUNT_VIEW },
    });
    await page.goto('/admin/users');

    await page.getByLabel('Rechercher un compte').fill('alice');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await page.getByRole('link', { name: '@AliceY' }).click();

    await page.waitForURL(`**/admin/users/${ALICE_ID}`);
    await expect(page.getByRole('heading', { name: 'Fiche du compte' })).toBeVisible();
    // The previous page can stay mounted but hidden: the role queries skip it.
    await expect(page.getByRole('definition').filter({ hasText: 'a***@d***.fr' })).toBeVisible();
    await expect(page.getByText('Connexion administrateur')).toBeVisible();
    expect(calls.some((call) => call.search.includes('q=alice'))).toBe(true);
  });

  test('the audit log can be filtered by action', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    const calls = await mockAdminApi(page, {
      'GET /admin/audit-log': (call: AdminCall) =>
        call.search.includes('action=user.suspend')
          ? { status: 200, body: { items: [FAILED_ENTRY], nextCursor: null } }
          : { status: 200, body: { items: [LOGIN_ENTRY, FAILED_ENTRY], nextCursor: null } },
    });
    await page.goto('/admin/audit');

    const table = page.getByRole('table', { name: 'Journal d’audit' });
    await expect(table.getByText('Code incorrect')).toBeVisible();

    await page.getByLabel('Type d’action').selectOption('user.suspend');

    await expect(table.getByText('Suspension de compte')).toBeVisible();
    expect(calls.some((call) => call.search.includes('action=user.suspend'))).toBe(true);
  });

  test('an expired administrator session on a page says so, with a link to sign in again', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    await mockAdminApi(page, {
      'GET /admin/audit-log': adminProblem(401, 'Connexion administrateur requise.'),
    });
    await page.goto('/admin/audit');

    await expect(formAlert(page)).toContainText('Votre session d’administration a pris fin.');
    await expect(page.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute('href', '/admin/login');
  });

  test('suspending an account asks for the re-authentication, then suspends once it is confirmed', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    let suspended = false;
    const reauthRequired = {
      status: 403,
      body: {
        type: 'about:blank',
        title: 'Interdit',
        status: 403,
        detail: 'Ré-authentification requise.',
        code: 'reauth_required',
      },
      headers: { 'content-type': 'application/problem+json' },
    };
    const calls = await mockAdminApi(page, {
      [`GET /admin/users/${ALICE_ID}`]: () => ({
        status: 200,
        body: suspended
          ? {
              ...ACCOUNT_VIEW,
              status: 'suspended',
              suspensionReason: 'Spam répété',
              statusChangedAt: '2026-10-21T12:00:00.000Z',
            }
          : ACCOUNT_VIEW,
      }),
      [`PUT /admin/users/${ALICE_ID}/status`]: () => {
        if (!calls.some((call) => call.method === 'POST' && call.path === '/admin/reauth')) {
          return reauthRequired;
        }
        suspended = true;
        return {
          status: 200,
          body: {
            id: ALICE_ID,
            status: 'suspended',
            statusChangedAt: '2026-10-21T12:00:00.000Z',
            suspensionReason: 'Spam répété',
          },
        };
      },
      'POST /admin/reauth': { status: 200, body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' } },
    });
    await page.goto(`/admin/users/${ALICE_ID}`);

    await page.getByRole('button', { name: 'Suspendre le compte' }).click();
    await page.getByLabel('Motif (obligatoire)').fill('Spam répété');
    await page
      .getByRole('dialog', { name: 'Suspendre le compte de @AliceY ?' })
      .getByRole('button', { name: 'Suspendre le compte' })
      .click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await expect(reauth).toBeVisible();
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Suspendu', { exact: true })).toBeVisible();
    const suspension = calls.filter((call) => call.method === 'PUT');
    expect(suspension).toHaveLength(2);
    expect(suspension[1]?.body).toEqual({ status: 'suspended', reason: 'Spam répété' });
  });

  test('a wrong code in the re-authentication keeps the dialog open, with the API message', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    await mockAdminApi(page, {
      [`GET /admin/users/${ALICE_ID}`]: { status: 200, body: ACCOUNT_VIEW },
      [`PUT /admin/users/${ALICE_ID}/status`]: {
        status: 403,
        body: {
          type: 'about:blank',
          title: 'Interdit',
          status: 403,
          detail: 'Ré-authentification requise.',
          code: 'reauth_required',
        },
        headers: { 'content-type': 'application/problem+json' },
      },
      'POST /admin/reauth': adminProblem(401, 'Identifiants incorrects'),
    });
    await page.goto(`/admin/users/${ALICE_ID}`);

    await page.getByRole('button', { name: 'Suspendre le compte' }).click();
    await page.getByLabel('Motif (obligatoire)').fill('Spam répété');
    await page
      .getByRole('dialog', { name: 'Suspendre le compte de @AliceY ?' })
      .getByRole('button', { name: 'Suspendre le compte' })
      .click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await page.getByLabel('Mot de passe', { exact: true }).fill('Mauvais1234!');
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(formAlert(page)).toContainText('Identifiants incorrects');
    await expect(reauth).toBeVisible();
  });

  test('the login screen has no accessibility violation', async ({ page }) => {
    await page.goto('/admin/login');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

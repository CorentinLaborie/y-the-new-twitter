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
  action: 'auth.mfa_enrol',
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

const CODE_REQUIRED = 'Saisissez le code de votre application d’authentification.';

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

  test('the login asks for the second factor, then opens the dashboard with the latest actions', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    await mockAdminApi(page, {
      'POST /admin/login': (call) =>
        call.body?.code === undefined
          ? { status: 200, body: { status: 'code_required' } }
          : { status: 200, body: { status: 'ok', user: { handle: 'admin', displayName: 'Administrateur' } } },
      'GET /admin/audit-log': { status: 200, body: { items: [LOGIN_ENTRY], nextCursor: null } },
    });
    await page.goto('/admin/login');

    await page.getByLabel('Adresse e-mail').fill('admin@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(formAlert(page)).toContainText(CODE_REQUIRED);

    await page.getByLabel('Code de vérification à 6 chiffres').fill('123456');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await page.waitForURL((url) => url.pathname === '/admin');
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    await expect(page.getByText('Connexion administrateur')).toBeVisible();
  });

  test('a wrong code keeps the form open and shows the API message', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    await mockAdminApi(page, {
      'POST /admin/login': adminProblem(401, 'Code de vérification incorrect.'),
    });
    await page.goto('/admin/login');

    await page.getByLabel('Adresse e-mail').fill('admin@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await page.getByLabel('Code de vérification à 6 chiffres').fill('000000');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(formAlert(page)).toContainText('Code de vérification incorrect.');
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
        call.search.includes('action=auth.mfa_enrol')
          ? { status: 200, body: { items: [FAILED_ENTRY], nextCursor: null } }
          : { status: 200, body: { items: [LOGIN_ENTRY, FAILED_ENTRY], nextCursor: null } },
    });
    await page.goto('/admin/audit');

    const table = page.getByRole('table', { name: 'Journal d’audit' });
    await expect(table.getByText('Code incorrect')).toBeVisible();

    await page.getByLabel('Type d’action').selectOption('auth.mfa_enrol');

    await expect(table.getByText('Double authentification configurée')).toBeVisible();
    expect(calls.some((call) => call.search.includes('action=auth.mfa_enrol'))).toBe(true);
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

  test('the login screen has no accessibility violation', async ({ page }) => {
    await page.goto('/admin/login');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

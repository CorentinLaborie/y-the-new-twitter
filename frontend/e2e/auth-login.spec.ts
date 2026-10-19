import { expect, test, type Page } from '@playwright/test';
import { bodyOf, expectCodePage, mockAuthApi, notice, problem, ui } from './auth-kit';

const EMAIL = 'alice@example.com';
const PASSWORD = 'Secret1234!';

async function fillLoginAndSubmit(page: Page): Promise<void> {
  await page.getByLabel(ui.email, { exact: true }).fill(EMAIL);
  await page.getByLabel(ui.password, { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: ui.submitLogin, exact: true }).click();
}

// The session answers "no session" until the login has succeeded, then the user.
function sessionAfterLogin(loggedIn: { value: boolean }) {
  return () => ({
    status: 200,
    body: { user: loggedIn.value ? { handle: 'alice', displayName: 'Alice' } : null },
  });
}

test('a valid login opens the protected home page', async ({ page }) => {
  const loggedIn = { value: false };
  const calls = await mockAuthApi(page, {
    'GET /auth/session': sessionAfterLogin(loggedIn),
    'POST /auth/login': () => {
      loggedIn.value = true;
      return { status: 200, body: { user: { handle: 'alice', displayName: 'Alice' } } };
    },
  });

  await page.goto('/login');
  await fillLoginAndSubmit(page);
  await page.waitForURL((url) => url.pathname === '/accueil');

  expect(bodyOf(calls, 'POST /auth/login')).toEqual({ email: EMAIL, password: PASSWORD });
});

test('a valid login opens the page given in next', async ({ page }) => {
  const loggedIn = { value: false };
  await mockAuthApi(page, {
    'GET /auth/session': sessionAfterLogin(loggedIn),
    'POST /auth/login': () => {
      loggedIn.value = true;
      return { status: 200, body: { user: { handle: 'alice', displayName: 'Alice' } } };
    },
  });

  await page.goto('/login?next=%2Faccueil');
  await fillLoginAndSubmit(page);

  await page.waitForURL((url) => url.pathname === '/accueil');
});

test('wrong credentials show one generic error and keep the user on the login page', async ({ page }) => {
  await mockAuthApi(page, { 'POST /auth/login': problem(401, 'Identifiants incorrects') });

  await page.goto('/login');
  await fillLoginAndSubmit(page);

  await expect(notice(page)).toContainText('Identifiants incorrects');
  await expect(page).toHaveURL(/\/login/);
});

test('an unverified account is told to enter its code, with a link to the code page', async ({ page }) => {
  await mockAuthApi(page, {
    'POST /auth/login': problem(403, 'Votre adresse e-mail n’est pas encore vérifiée.'),
  });

  await page.goto('/login');
  await fillLoginAndSubmit(page);

  await expect(notice(page)).toContainText('pas encore validé');
  await page.getByRole('link', { name: ui.verifyLink }).click();
  await expectCodePage(page, EMAIL);
});

test('a locked account shows the waiting time given by Retry-After', async ({ page }) => {
  await mockAuthApi(page, {
    'POST /auth/login': problem(429, 'Trop de tentatives. Réessayez plus tard.', { 'Retry-After': '900' }),
  });

  await page.goto('/login');
  await fillLoginAndSubmit(page);

  // 900 seconds: the page must show 15 minutes.
  await expect(notice(page)).toContainText(/15 min/i);
});

test('a visitor without session is sent to the login page from the protected zone', async ({ page }) => {
  await mockAuthApi(page);

  await page.goto('/accueil');
  await page.waitForURL((url) => url.pathname === '/login');
});

import { expect, test, type Page } from '@playwright/test';
import { bodyOf, expectCodePage, mockAuthApi, notice, problem, ui } from './auth-kit';

const EMAIL = 'nouvel.utilisateur@example.com';
const ADULT_BIRTH_DATE = '1990-05-12';

// The form takes the date as JJ/MM/AAAA; the API receives the ISO form (AAAA-MM-JJ).
function frenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

async function fillSignupAndSubmit(page: Page, email: string, birthDate: string): Promise<void> {
  await page.getByLabel(ui.handle, { exact: true }).fill('alice');
  await page.getByLabel(ui.displayName, { exact: true }).fill('Alice');
  await page.getByLabel(ui.signupEmail, { exact: true }).fill(email);
  await page.getByLabel(ui.password, { exact: true }).fill('Secret1234!');
  await page.getByLabel(ui.passwordConfirm, { exact: true }).fill('Secret1234!');
  await page.getByLabel(ui.birthDate, { exact: true }).fill(frenchDate(birthDate));
  await page.getByLabel(ui.terms, { exact: true }).check();
  await page.getByRole('button', { name: ui.submitSignup, exact: true }).click();
}

test('a complete signup ends on the login page', async ({ page }) => {
  const calls = await mockAuthApi(page, {
    'POST /auth/signup': { status: 202 },
    'POST /auth/signup/verify': { status: 200, body: {} },
  });

  await page.goto('/signup');
  await fillSignupAndSubmit(page, EMAIL, ADULT_BIRTH_DATE);
  await expect(page).toHaveURL(/\/signup\/code$/);

  await page.getByLabel(ui.signupCode, { exact: true }).fill('123456');
  await page.getByRole('button', { name: ui.submitCode, exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  await expect(page.getByLabel(ui.email, { exact: true })).toHaveValue(EMAIL);

  expect(bodyOf(calls, 'POST /auth/signup')).toMatchObject({
    email: EMAIL,
    birthDate: ADULT_BIRTH_DATE,
    termsAccepted: true,
    termsVersion: '1.0',
  });
  expect(bodyOf(calls, 'POST /auth/signup/verify')).toEqual({ email: EMAIL, code: '123456' });
});

test('an e-mail already in use gets the same answer as a new one', async ({ page }) => {
  // The API answers 202 whether or not the address exists (section 9.4): the page must not tell them apart.
  const calls = await mockAuthApi(page, { 'POST /auth/signup': { status: 202 } });

  await page.goto('/signup');
  await fillSignupAndSubmit(page, 'deja.inscrit@example.com', ADULT_BIRTH_DATE);

  await expect(page).toHaveURL(/\/signup\/code$/);
  await expect(notice(page)).toHaveCount(0);
  expect(bodyOf(calls, 'POST /auth/signup')).toMatchObject({ email: 'deja.inscrit@example.com' });
});

test('a wrong code shows an error and keeps the user on the code page', async ({ page }) => {
  await mockAuthApi(page, {
    'POST /auth/signup': { status: 202 },
    'POST /auth/signup/verify': problem(422, 'Code incorrect ou expiré.'),
  });

  await page.goto('/signup');
  await fillSignupAndSubmit(page, EMAIL, ADULT_BIRTH_DATE);
  await expect(page).toHaveURL(/\/signup\/code$/);

  await page.getByLabel(ui.signupCode, { exact: true }).fill('000000');
  await page.getByRole('button', { name: ui.submitCode, exact: true }).click();

  // A wrong code is an error on the code field itself, not a notice.
  await expect(page.getByText(/code est incorrect/i)).toBeVisible();
  await expectCodePage(page);
});

test('the code can be sent again from the code page', async ({ page }) => {
  const calls = await mockAuthApi(page, {
    'POST /auth/signup': { status: 202 },
    'POST /auth/signup/resend': { status: 202 },
  });

  await page.goto('/signup');
  await fillSignupAndSubmit(page, EMAIL, ADULT_BIRTH_DATE);
  await expect(page).toHaveURL(/\/signup\/code$/);

  await page.getByRole('button', { name: ui.resendCode, exact: true }).click();

  await expect(page.getByRole('status')).toContainText(ui.resentMessage);
  expect(bodyOf(calls, 'POST /auth/signup/resend')).toEqual({ email: EMAIL });
});

test('a user under 18 is refused at signup, before any code is sent', async ({ page }) => {
  // R7: signup rejects younger birth dates. Owner choice: refused in the form, no account and no code.
  const calls = await mockAuthApi(page, { 'POST /auth/signup': { status: 202 } });

  await page.goto('/signup');
  await fillSignupAndSubmit(page, EMAIL, '2012-03-04');

  await expect(page.getByText('Vous devez avoir au moins 18 ans.')).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  expect(calls.filter((call) => call.path === '/auth/signup')).toHaveLength(0);
});

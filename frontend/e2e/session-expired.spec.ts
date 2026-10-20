import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, problemReply, question, signIn } from './feed-kit';

// Session expired (product doc, section 11 state table): a 401 of the protected area sends the visitor to the login
// page with the reason in the URL, and the login page says so. The API is mocked (feed-kit.ts), as the other tests.
// The session of the protected page is answered by e2e/session-stub.mjs (cookie SESSION=e2e-feed).
// Runs in the three projects of playwright.config.ts: desktop, tablet and mobile.

// WCAG 2.2 AA (product doc, accessibility contract).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const EXPIRED_MESSAGE = 'Votre session a expiré. Reconnectez-vous pour continuer.';
const CONNECTION_ADVICE = 'Vérifiez votre connexion';
const SUBMIT_LOGIN = 'Se connecter';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectExpiredLoginPage(page: Page) {
  // The marker is the only thing in the query string: no e-mail, no identifier.
  await expect(page).toHaveURL(/\/login\?reason=session-expired$/);
  await expect(page.getByRole('status').filter({ hasText: EXPIRED_MESSAGE })).toBeVisible();
  await expect(page.getByRole('button', { name: SUBMIT_LOGIN, exact: true })).toBeVisible();
  await expect(page.getByText(CONNECTION_ADVICE)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
}

test('a 401 on the feed sends the visitor to the login page with the expired-session message', async ({
  context,
  page,
}) => {
  await signIn(context);
  await mockFeedApi(page, { feed: () => problemReply(401, 'Session absente.') });

  await page.goto('/home');

  await expectExpiredLoginPage(page);
});

test('a session that ends while the feed is open: the next reaction sends the visitor to the login page', async ({
  context,
  page,
}) => {
  await signIn(context);
  await mockFeedApi(page, {
    feed: () => feedPage([question('a', 'Question affichée avant la fin de la session')]),
    reaction: () => problemReply(401, 'Session absente.'),
  });

  await page.goto('/home');
  await expect(page.getByText('Question affichée avant la fin de la session')).toBeVisible();
  await page.locator('button[data-kind="like"]').first().click();

  await expectExpiredLoginPage(page);
});

test('the expired-session login page has no WCAG 2.2 AA violation', async ({ context, page }) => {
  await signIn(context);
  await mockFeedApi(page, { feed: () => problemReply(401, 'Session absente.') });

  await page.goto('/home');
  await expect(page.getByRole('status').filter({ hasText: EXPIRED_MESSAGE })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

test('a plain login page, without the reason, shows no expired-session message', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('button', { name: SUBMIT_LOGIN, exact: true })).toBeVisible();
  await expect(page.getByText(EXPIRED_MESSAGE)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

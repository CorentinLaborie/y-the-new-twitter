import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, signIn } from './feed-kit';

// Suspended-account banner and contact form (product doc sections 3.4 and 12.6, DEC-078). Mocked API, on the three
// viewports of playwright.config.ts. The banner reads the session in the browser, so the session answer and the
// contact call are answered here; the protected page itself is served by e2e/session-stub.mjs.

const API_ORIGIN = 'http://localhost:8080';
const CONTACT_PATH = '/support/messages';
const REFERENCE = 'CNT-20261020-0001';
const CSRF = 'csrf-e2e';

type ContactCall = { body: { text: string }; csrf: string | null };

async function mockAccount(page: Page, status: 'active' | 'suspended') {
  const contactCalls: ContactCall[] = [];
  const sessionCalls: string[] = [];

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const cors = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, x-csrf-token, idempotency-key',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    };

    if (request.method() === 'GET' && path === '/auth/session') {
      sessionCalls.push(path);
      const user =
        status === 'suspended'
          ? { handle: 'alice', displayName: 'Alice Martin', status: 'suspended' }
          : { handle: 'alice', displayName: 'Alice Martin', status: 'active' };
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ user }),
      });
      return;
    }

    if (request.method() === 'POST' && path === CONTACT_PATH) {
      contactCalls.push({
        body: JSON.parse(request.postData() ?? '{}') as { text: string },
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      await route.fulfill({
        status: 201,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ reference: REFERENCE }),
      });
      return;
    }

    // Other calls (the feed, the preflight requests) are answered by mockFeedApi.
    await route.fallback();
  });

  return { contactCalls, sessionCalls };
}

function bannerButton(page: Page) {
  return page.getByRole('button', { name: 'Contacter l’administrateur' });
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await mockFeedApi(page, { feed: () => feedPage([]) });
});

test('a suspended account sees the banner with the suspension sentence and the contact button', async ({
  page,
}) => {
  await mockAccount(page, 'suspended');

  await page.goto('/home');

  await expect(page.getByText('Votre compte est suspendu.')).toBeVisible();
  await expect(
    page.getByText('Pour toute question, contactez-nous à l’adresse indiquée dans les mentions légales.'),
  ).toBeVisible();
  await expect(bannerButton(page)).toBeVisible();
  await expect(bannerButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expectNoHorizontalScroll(page);
});

test('an active account sees no banner', async ({ page }) => {
  const { sessionCalls } = await mockAccount(page, 'active');

  await page.goto('/home');

  // The banner checks the session once the page is loaded: wait for that check before asserting its absence.
  await expect.poll(() => sessionCalls.length).toBeGreaterThan(0);
  await expect(page.getByText('Votre compte est suspendu.')).toHaveCount(0);
  await expect(bannerButton(page)).toHaveCount(0);
});

test('the contact form sends the trimmed message and shows the reference of the thread', async ({ page }) => {
  const { contactCalls } = await mockAccount(page, 'suspended');
  await page.goto('/home');

  await bannerButton(page).click();
  await expect(bannerButton(page)).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Votre message').fill('  Je conteste la suspension.  ');
  await expect(page.getByText(/^\d+\/1000$/)).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  await expect(page.getByText('Message envoyé')).toBeVisible();
  await expect(page.getByText(`Référence : ${REFERENCE}`)).toBeVisible();
  expect(contactCalls).toEqual([{ body: { text: 'Je conteste la suspension.' }, csrf: CSRF }]);
  await expectNoHorizontalScroll(page);
});

test('the contact form refuses a message of more than 1000 characters', async ({ page }) => {
  const { contactCalls } = await mockAccount(page, 'suspended');
  await page.goto('/home');

  await bannerButton(page).click();
  await page.getByLabel('Votre message').fill('a'.repeat(1001));

  await expect(page.getByText('1001/1000')).toBeVisible();
  await expect(page.getByText('Votre message dépasse 1000 caractères.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
  expect(contactCalls).toHaveLength(0);
  await expectNoHorizontalScroll(page);
});

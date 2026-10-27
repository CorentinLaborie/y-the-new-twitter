import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { conversationOf, messageOf, mockMessagesApi } from './messages-kit';

// The private messages screens at 325 px wide (section 9 of the conditions, plan L7). Mocked API. Runs in the mobile-325
// project only.

const C1 = '4c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';
const LONG_TEXT = 'Un message assez long pour passer à la ligne plusieurs fois sur un écran aussi étroit que celui-ci';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the list fits 325 px: no horizontal scroll, the tabs and the rows are readable', async ({ page }) => {
  await mockMessagesApi(page, {
    list: () => ({
      status: 200,
      body: {
        conversations: [
          conversationOf(C1, { displayName: 'Une personne au très long nom affiché pour tester la coupure', unread: true }),
        ],
        nextCursor: null,
      },
    }),
    conversation: () => ({ status: 200, body: conversationOf(C1) }),
    messages: () => ({ status: 200, body: { messages: [], nextCursor: null } }),
  });

  await page.goto('/messages');

  await expect(page.getByRole('tab', { name: 'Archivées' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Conversation avec/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  const tab = await page.getByRole('tab', { name: 'Demandes' }).boundingBox();
  expect(tab?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('a conversation fits 325 px: long messages wrap, and the send button keeps a 44 px target', async ({ page }) => {
  await mockMessagesApi(page, {
    list: () => ({ status: 200, body: { conversations: [], nextCursor: null } }),
    conversation: () => ({ status: 200, body: conversationOf(C1) }),
    messages: () => ({
      status: 200,
      body: { messages: [messageOf('m1', LONG_TEXT, true), messageOf('m2', LONG_TEXT, false)], nextCursor: null },
    }),
  });

  await page.goto(`/messages/${C1}`);

  await expect(page.getByText(LONG_TEXT).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  const send = await page.getByRole('button', { name: 'Envoyer' }).boundingBox();
  expect(send?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('the new message form fits 325 px and its send button keeps a 44 px target', async ({ page }) => {
  await mockMessagesApi(page, {
    list: () => ({ status: 200, body: { conversations: [], nextCursor: null } }),
    conversation: () => ({ status: 200, body: conversationOf(C1) }),
    messages: () => ({ status: 200, body: { messages: [], nextCursor: null } }),
  });

  await page.goto('/messages/new');

  await expect(page.getByLabel('Destinataire')).toBeVisible();
  await expectNoHorizontalScroll(page);
  const send = await page.getByRole('button', { name: 'Envoyer' }).boundingBox();
  expect(send?.height ?? 0).toBeGreaterThanOrEqual(44);
});

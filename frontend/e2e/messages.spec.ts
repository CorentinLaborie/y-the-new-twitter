import { expect, test, type Page } from '@playwright/test';
import { signIn } from './feed-kit';
import { conversationOf, messageOf, mockMessagesApi, type MessagesHandlers } from './messages-kit';
import { corsHeaders } from './profile-kit';

// The private messages screens: the list (/messages, three tabs), a conversation (/messages/{id}) and a new message
// (/messages/new). Mocked API, on the three screen sizes (desktop, tablet, mobile).

const C1 = '4c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';
const NEW_ID = '7d2e1f0a-3b4c-4d5e-8f6a-9b0c1d2e3f40';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** The handlers of a viewer with one accepted conversation, a thread of two messages, and no request. */
function accepted(overrides: Partial<MessagesHandlers> = {}): MessagesHandlers {
  return {
    list: () => ({ status: 200, body: { conversations: [conversationOf('c1', { unread: true })], nextCursor: null } }),
    conversation: (id) => ({ status: 200, body: conversationOf(id) }),
    messages: () => ({
      status: 200,
      body: {
        messages: [
          messageOf('m2', 'Réponse d’Alice', false, '2026-10-27T09:33:00Z'),
          messageOf('m1', 'Bonjour Alice', true, '2026-10-27T09:30:00Z'),
        ],
        nextCursor: null,
      },
    }),
    ...overrides,
  };
}

test('the list shows the accepted conversations with their state, and the requests tab asks for the requests', async ({
  page,
}) => {
  const calls = await mockMessagesApi(
    page,
    accepted({
      list: (query) =>
        query.get('requests') === 'true'
          ? { status: 200, body: { conversations: [], nextCursor: null } }
          : {
              status: 200,
              body: {
                conversations: [
                  conversationOf(C1, { unread: true, lastMessage: { text: 'Salut Alice', mine: true } }),
                  conversationOf('c2', { handle: 'bob', displayName: 'Bob' }),
                ],
                nextCursor: null,
              },
            },
    }),
  );

  await page.goto('/messages');

  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conversation avec Alice' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conversation avec Bob' })).toBeVisible();
  await expect(page.getByLabel('Non lu')).toHaveCount(1);
  // The list shows the newest message under each account: « Vous : » when the viewer wrote it (Messages boards).
  await expect(page.getByText('Vous : Salut Alice')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('tab', { name: 'Demandes' }).click();

  await expect(page.getByRole('heading', { name: 'Aucune demande en attente' })).toBeVisible();
  expect(calls.flags).toEqual([]);
});

test('a conversation shows its messages oldest first, is marked read, and a sent message joins the thread', async ({
  page,
}) => {
  const calls = await mockMessagesApi(page, accepted());

  await page.goto(`/messages/${C1}`);

  const thread = page.getByRole('list', { name: 'Messages' });
  await expect(thread.locator('li').first()).toContainText('Bonjour Alice');
  await expect(thread.locator('li').nth(1)).toContainText('Réponse d’Alice');
  expect(calls.flags).toContainEqual({ conversationId: C1, verb: 'PUT read' });

  await page.getByLabel('Écrire un message à Alice').fill('Merci');
  await page.getByRole('button', { name: 'Envoyer' }).click();

  await expect(thread.locator('li').last()).toContainText('Merci');
  await expect(page.getByLabel('Écrire un message à Alice')).toHaveValue('');
  expect(calls.sent).toEqual([{ conversationId: C1, text: 'Merci' }]);
  await expectNoHorizontalScroll(page);
});

test('a request waiting for the viewer is accepted from the thread, which then opens the composer', async ({ page }) => {
  const calls = await mockMessagesApi(
    page,
    accepted({
      conversation: (id) => ({
        status: 200,
        body: conversationOf(id, { status: 'pending', initiatedByViewer: false, handle: 'bob', displayName: 'Bob' }),
      }),
    }),
  );

  await page.goto(`/messages/${C1}`);

  await expect(page.getByText('Acceptez la demande avant de répondre.')).toBeVisible();
  await page.getByRole('button', { name: 'Accepter' }).click();

  await expect(page.getByLabel('Écrire un message à Bob')).toBeEnabled();
  expect(calls.answered).toEqual([{ conversationId: C1, verb: 'accept' }]);
});

test('a declined conversation keeps the composer closed and says why', async ({ page }) => {
  await mockMessagesApi(
    page,
    accepted({
      conversation: (id) => ({ status: 200, body: conversationOf(id, { status: 'declined' }) }),
    }),
  );

  await page.goto(`/messages/${C1}`);

  await expect(page.getByText('Cette demande a été refusée.')).toBeVisible();
  await expect(page.getByLabel('Écrire un message à Alice')).toBeDisabled();
});

test('the menu mutes and archives the conversation for the viewer only', async ({ page }) => {
  const calls = await mockMessagesApi(page, accepted());

  await page.goto(`/messages/${C1}`);
  await page.getByRole('button', { name: 'Options de la conversation' }).click();
  // The menu opens the profile of the other account (Voir le profil, Messages-Desktop boards).
  await expect(page.getByRole('menuitem', { name: 'Voir le profil' })).toHaveAttribute('href', '/u/alice');
  await page.getByRole('menuitem', { name: 'Mettre en sourdine' }).click();
  // The menu closes once the server has answered: reopen it only then.
  await expect(page.getByRole('menu')).toBeHidden();

  await page.getByRole('button', { name: 'Options de la conversation' }).click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();

  await expect.poll(() => calls.flags).toContainEqual({ conversationId: C1, verb: 'PUT mute' });
  await expect.poll(() => calls.flags).toContainEqual({ conversationId: C1, verb: 'PUT archive' });
});

test('blocking from the menu asks for confirmation, then blocks the account and returns to the list', async ({ page }) => {
  const calls = await mockMessagesApi(page, accepted());

  await page.goto(`/messages/${C1}`);
  await page.getByRole('button', { name: 'Options de la conversation' }).click();
  await page.getByRole('menuitem', { name: 'Bloquer' }).click();
  await expect(page.getByRole('dialog', { name: 'Bloquer @alice ?' })).toBeVisible();
  await page.getByRole('button', { name: 'Bloquer', exact: true }).click();

  await expect(page).toHaveURL(/\/messages$/);
  expect(calls.blocked).toEqual(['alice']);
});

test('a new message opens the conversation the API returns, and a refused handle says so', async ({ page }) => {
  const calls = await mockMessagesApi(
    page,
    accepted({
      conversation: (id) => ({ status: 200, body: conversationOf(id, { handle: 'bob', displayName: 'Bob' }) }),
      messages: () => ({ status: 200, body: { messages: [], nextCursor: null } }),
    }),
  );

  await page.goto('/messages/new');
  await page.getByLabel('Rechercher une personne', { exact: true }).fill('bob');
  await page.getByLabel('Message', { exact: true }).fill('Salut Bob');
  await page.getByRole('button', { name: 'Envoyer' }).click();

  await expect(page).toHaveURL(new RegExp(`/messages/${NEW_ID}$`));
  expect(calls.started).toEqual([{ handle: 'bob', text: 'Salut Bob' }]);
});

test('a new message suggests the linked accounts, and a click fills the recipient', async ({ page }) => {
  await mockMessagesApi(page, accepted());
  // Registered after the messages mocks, so it answers the mention suggestions (the Messages-New boards).
  await page.route('http://localhost:8080/api/v1/mentions/suggestions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(route.request().headers()['origin']),
      body: JSON.stringify({ items: [{ handle: 'bob', displayName: 'Bob' }] }),
    });
  });

  await page.goto('/messages/new');
  await page.getByRole('option', { name: /Bob/ }).click();

  await expect(page.getByLabel('Rechercher une personne', { exact: true })).toHaveValue('bob');
});

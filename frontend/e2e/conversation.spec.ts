import { expect, test, type Page } from '@playwright/test';
import { makeReply, mockConversationApi, QUESTION_ID, questionDetail } from './conversation-kit';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';

// The conversation under a question is shown on the share view (/questions/{id}), read-only: the share view has no
// reply composer. The card menu and the 50 Y dialog are on the question card of the home feed too.
// Each test runs on the three projects of playwright.config.ts (desktop, tablet, mobile).

const SHARE_PATH = `/questions/${QUESTION_ID}`;

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/** The conversation under the question: the region the section names "Réponses à la question". */
function conversationOf(page: Page) {
  return page.getByRole('region', { name: 'Réponses à la question' });
}

/** The reply whose text contains `text`, as a list item of the conversation. */
function replyWith(page: Page, text: string) {
  return conversationOf(page).getByRole('listitem').filter({ hasText: text });
}

test('below 50 Y, the card shows the reply count and the conversation is closed with its Y count', async ({
  page,
}) => {
  await mockConversationApi(page, {
    question: questionDetail({ y: 49, reply: 3, conversationOpen: false }),
    replies: [makeReply(1), makeReply(2), makeReply(3)],
  });

  await page.goto(SHARE_PATH);

  await expect(page.getByText('3 réponses', { exact: true })).toBeVisible();
  await expect(page.getByText('Les réponses s’ouvrent à 50 Y')).toBeVisible();
  await expect(page.getByText('49 / 50 Y')).toBeVisible();
  // Closed: no list of replies, and no composer.
  await expect(conversationOf(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Répondre', exact: true })).toHaveCount(0);
});

test('at 50 Y, the replies show oldest first, and "Voir plus de réponses" loads the next page inline', async ({
  page,
}) => {
  const replies = Array.from({ length: 47 }, (_, index) => makeReply(index + 1));
  await mockConversationApi(page, {
    question: questionDetail({ y: 50, reply: 47, conversationOpen: true }),
    replies,
  });

  await page.goto(SHARE_PATH);

  const items = conversationOf(page).getByRole('listitem');
  await expect(items).toHaveCount(20);
  await expect(items.first()).toContainText('Réponse 01');
  await expect(items.last()).toContainText('Réponse 20');
  await expect(conversationOf(page).getByText('20 réponses affichées sur 47')).toBeVisible();

  await conversationOf(page).getByRole('button', { name: 'Voir plus de réponses' }).click();

  await expect(items).toHaveCount(40);
  await expect(items.nth(20)).toContainText('Réponse 21');
  await expect(conversationOf(page).getByText('40 réponses affichées sur 47')).toBeVisible();

  await conversationOf(page).getByRole('button', { name: 'Voir plus de réponses' }).click();

  await expect(items).toHaveCount(47);
  await expect(items.last()).toContainText('Réponse 47');
  await expect(conversationOf(page).getByRole('button', { name: 'Voir plus de réponses' })).toHaveCount(0);
});

test('a reply reaction is set and removed on its own, each kind with its own count', async ({ page }) => {
  const { calls } = await mockConversationApi(page, {
    question: questionDetail({ y: 50, reply: 1, conversationOpen: true }),
    replies: [makeReply(1, { like: 4, dislike: 1 })],
  });

  await page.goto(SHARE_PATH);

  const reply = replyWith(page, 'Réponse 01');
  const like = reply.locator('button[data-kind="like"]');
  const dislike = reply.locator('button[data-kind="dislike"]');
  await expect(like).toHaveAccessibleName('4 J’aime');
  await expect(dislike).toHaveAccessibleName('1 Pas d’accord');

  // Each click waits for the answer: while a reaction is in flight, its buttons are off (aria-disabled).
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveAccessibleName('5 J’aime');
  await expect(like).not.toHaveAttribute('aria-disabled');

  await dislike.click();
  await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(dislike).toHaveAccessibleName('2 Pas d’accord');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(dislike).not.toHaveAttribute('aria-disabled');

  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like).toHaveAccessibleName('4 J’aime');
  await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(like).not.toHaveAttribute('aria-disabled');

  expect(calls).toEqual([
    'PUT /replies/reply-01/reactions/like',
    'PUT /replies/reply-01/reactions/dislike',
    'DELETE /replies/reply-01/reactions/like',
  ]);
});

test('deleting one of my replies asks for confirmation, then removes it and lowers the count', async ({
  page,
}) => {
  // Signed in as alice (session-stub.mjs): her reply is the third one, on the first page of 20.
  const replies = Array.from({ length: 25 }, (_, index) => makeReply(index + 1));
  replies[2] = makeReply(3, { handle: 'alice', displayName: 'Alice Martin' });
  const { calls } = await mockConversationApi(page, {
    question: questionDetail({ y: 50, reply: 25, conversationOpen: true }),
    replies,
  });

  await page.goto(SHARE_PATH);

  await expect(conversationOf(page).getByText('20 réponses affichées sur 25')).toBeVisible();
  await replyWith(page, 'Réponse 03').getByRole('button', { name: 'Options de cette réponse' }).click();
  await page.getByRole('menuitem', { name: 'Supprimer ma réponse' }).click();

  const dialog = page.getByRole('dialog', { name: 'Supprimer cette réponse ?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(replyWith(page, 'Réponse 03')).toHaveCount(0);
  await expect(conversationOf(page).getByText('19 réponses affichées sur 24')).toBeVisible();
  expect(calls).toEqual(['DELETE /replies/reply-03']);
});

test('a reply that mentions someone shows the @handle as plain text, not as a link', async ({ page }) => {
  await mockConversationApi(page, {
    question: questionDetail({ y: 50, reply: 1, conversationOpen: true }),
    replies: [makeReply(1, { text: 'Merci @marthe_b, bien vu !' })],
  });

  await page.goto(SHARE_PATH);

  const reply = replyWith(page, 'Merci');
  await expect(reply.locator('p')).toHaveText('Merci @marthe_b, bien vu !');
  await expect(reply.locator('[data-mention="marthe_b"]')).toHaveText('@marthe_b');
  await expect(reply.getByRole('link')).toHaveCount(0);
});

test('"Copier le lien" in the card menu copies the question link and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockFeedApi(page, {
    feed: () => feedPage([question('a', 'Question à partager')]),
  });

  await page.goto('/home');

  await expect(page.getByText('Question à partager')).toBeVisible();
  await page.getByRole('button', { name: 'Plus d’options' }).click();
  await page.getByRole('menuitem', { name: 'Copier le lien' }).click();

  await expect(page.getByText('Lien copié.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/questions\/a$/);
});

test('the information button next to the Y counter opens the 50 Y dialog, and Escape closes it', async ({
  page,
}) => {
  await mockFeedApi(page, {
    feed: () => feedPage([question('a', 'Question sur la règle des 50 Y')]),
  });

  await page.goto('/home');

  const infoButton = page.getByRole('button', { name: 'En savoir plus sur les 50 Y' });
  await infoButton.click();

  const dialog = page.getByRole('dialog', { name: 'Les 50 Y' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('La conversation d’une question s’ouvre lorsqu’elle atteint 50 Y');

  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(infoButton).toBeFocused();
});

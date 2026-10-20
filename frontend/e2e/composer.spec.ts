import { expect, test, type Page } from '@playwright/test';
import {
  makeReply,
  mockConversationApi,
  QUESTION_ID,
  questionDetail,
  type ReplyJson,
} from './conversation-kit';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';

// The reply composer under an open conversation, on the home feed (mocked API). The composer sits at the end of the
// conversation under a question with 50 Y. Each test runs on the three projects of playwright.config.ts.

const QUESTION_TEXT = 'Question avec conversation ouverte';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/**
 * Opens the conversation under the question of the feed (50 Y, the replies of `replies`) and waits for its replies.
 * The feed mock is registered first; the conversation mock is registered after it and lets the feed calls through.
 */
async function openConversation(page: Page, replies: ReplyJson[]) {
  await mockFeedApi(page, {
    feed: () =>
      feedPage([
        {
          ...question(QUESTION_ID, QUESTION_TEXT),
          conversationOpen: true,
          counters: { like: 10, dislike: 2, y: 50, reply: replies.length },
        },
      ]),
  });
  const { calls } = await mockConversationApi(
    page,
    {
      question: questionDetail({ y: 50, reply: replies.length, conversationOpen: true, text: QUESTION_TEXT }),
      replies,
    },
    { fallthrough: true },
  );

  await page.goto('/home');
  await page.getByRole('button', { name: `${replies.length} réponses`, exact: true }).click();

  const conversation = page.getByRole('region', { name: 'Réponses à la question' });
  await expect(conversation.getByRole('listitem')).toHaveCount(replies.length);
  return {
    conversation,
    composer: conversation.getByLabel('Votre réponse', { exact: true }),
    sendButton: conversation.getByRole('button', { name: 'Répondre', exact: true }),
    calls,
  };
}

test('a reply over 280 characters keeps "Répondre" disabled, and nothing is sent', async ({ page }) => {
  const { conversation, composer, sendButton, calls } = await openConversation(page, [
    makeReply(1),
    makeReply(2),
  ]);

  await composer.fill('a'.repeat(280));
  await expect(sendButton).toBeEnabled();

  await composer.fill('a'.repeat(281));
  await expect(conversation.getByText('Votre réponse dépasse 280 caractères.')).toBeVisible();
  await expect(conversation.getByText('281/280')).toBeVisible();
  await expect(sendButton).toBeDisabled();

  expect(calls).toEqual([]);
  await expect(conversation.getByRole('listitem')).toHaveCount(2);
});

test('a valid reply is posted: it appears at the end of the list, and the count on the card goes up', async ({
  page,
}) => {
  const { conversation, composer, sendButton, calls } = await openConversation(page, [
    makeReply(1),
    makeReply(2),
  ]);

  await composer.fill('Ma réponse au fil');
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  const items = conversation.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(1)).toContainText('Réponse 02');
  await expect(items.last()).toContainText('Ma réponse au fil');
  await expect(composer).toHaveValue('');

  // The count of the card follows the reply: 2 réponses becomes 3 réponses.
  await expect(page.getByRole('button', { name: '3 réponses', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 réponses', exact: true })).toHaveCount(0);

  expect(calls).toEqual([`POST /questions/${QUESTION_ID}/replies`]);
});

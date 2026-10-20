import { expect, test } from '@playwright/test';
import { makeReply, mockConversationApi, QUESTION_ID, questionDetail } from './conversation-kit';
import { signIn } from './feed-kit';

// The share view (/questions/{id}): one question and its conversation, read-only. It is reached from a copied link,
// so these tests open the address directly; the page is not linked from the navigation, and no test checks that.
// Each test runs on the three projects of playwright.config.ts (desktop, tablet, mobile).

// A valid UUID that the API does not know: the share page asks the API, which answers 404.
const UNKNOWN_QUESTION_ID = '0b7c9d2e-1f3a-4c5b-8d6e-7f8091a2b3c4';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('the question and its replies are shown, and the page has no reply composer', async ({ page }) => {
  await mockConversationApi(page, {
    question: questionDetail({ y: 50, reply: 2, conversationOpen: true, text: 'Question partagée' }),
    replies: [makeReply(1), makeReply(2, { handle: 'alice', displayName: 'Alice Martin' })],
  });

  await page.goto(`/questions/${QUESTION_ID}`);

  await expect(page.getByText('Question partagée')).toBeVisible();
  const conversation = page.getByRole('region', { name: 'Réponses à la question' });
  const items = conversation.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Réponse 01');
  await expect(items.nth(1)).toContainText('Réponse 02');

  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByLabel('Votre réponse', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Répondre', exact: true })).toHaveCount(0);
});

test('an unknown question shows that it is not available', async ({ page }) => {
  await mockConversationApi(page, { question: null, replies: [] });

  await page.goto(`/questions/${UNKNOWN_QUESTION_ID}`);

  await expect(page.getByRole('heading', { name: 'Cette question n’est pas disponible.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Réponses à la question' })).toHaveCount(0);
});

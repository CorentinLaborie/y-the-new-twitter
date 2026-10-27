import { expect, test, type Page } from '@playwright/test';
import { makeReply, mockConversationApi, QUESTION_ID, questionDetail } from './conversation-kit';
import { signIn } from './feed-kit';

// The removed-question notice of the share view at 325 px wide (plan L7, section 4). Mocked API. Runs in the mobile-325
// project only.

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the removal notice fits 325 px: no horizontal scroll, and the home link is shown', async ({ page }) => {
  await mockConversationApi(page, {
    question: {
      ...questionDetail({ y: 0, reply: 0, conversationOpen: false, text: 'Texte retiré' }),
      removedByModeration: true,
    },
    replies: [makeReply(1)],
  });

  await page.goto(`/questions/${QUESTION_ID}`);

  await expect(page.getByRole('heading', { name: 'Retirée par la modération' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

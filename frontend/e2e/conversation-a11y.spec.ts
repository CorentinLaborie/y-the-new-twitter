import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { makeReply, mockConversationApi, QUESTION_ID, questionDetail } from './conversation-kit';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';

// WCAG 2.2 AA (product doc, accessibility contract), as accessibility.spec.ts.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// The widths of the three boards: mobile 360, tablet 768, desktop 1440.
const BOARD_WIDTHS = [360, 768, 1440];

const QUESTION_TEXT = 'Question de la conversation accessible';

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoAxeViolation(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
}

/** The conversation under the question: the region the section names "Réponses à la question". */
function conversationOf(page: Page) {
  return page.getByRole('region', { name: 'Réponses à la question' });
}

const REPLIES = [
  makeReply(1),
  makeReply(2, { handle: 'alice', displayName: 'Alice Martin', like: 3, viewerReactions: ['like'] }),
  makeReply(3, { text: 'Merci @marthe_b, bien vu !', dislike: 1 }),
];

test('the conversation open under a question, with its replies, has no WCAG 2.2 AA violation at the three board widths', async ({
  page,
}) => {
  await mockFeedApi(page, {
    feed: () =>
      feedPage([
        {
          ...question(QUESTION_ID, QUESTION_TEXT),
          conversationOpen: true,
          counters: { like: 10, dislike: 2, y: 50, reply: REPLIES.length },
        },
      ]),
  });
  await mockConversationApi(
    page,
    {
      question: questionDetail({ y: 50, reply: REPLIES.length, conversationOpen: true, text: QUESTION_TEXT }),
      replies: REPLIES,
    },
    { fallthrough: true },
  );

  for (const width of BOARD_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/home');
    await page.getByRole('button', { name: `${REPLIES.length} réponses`, exact: true }).click();
    await expect(conversationOf(page).getByRole('listitem')).toHaveCount(REPLIES.length);

    await expectNoAxeViolation(page);
  }
});

test('the share view of a question, with its replies, has no WCAG 2.2 AA violation at the three board widths', async ({
  page,
}) => {
  await mockConversationApi(page, {
    question: questionDetail({ y: 50, reply: REPLIES.length, conversationOpen: true, text: QUESTION_TEXT }),
    replies: REPLIES,
  });

  for (const width of BOARD_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/questions/${QUESTION_ID}`);
    await expect(conversationOf(page).getByRole('listitem')).toHaveCount(REPLIES.length);

    await expectNoAxeViolation(page);
  }
});

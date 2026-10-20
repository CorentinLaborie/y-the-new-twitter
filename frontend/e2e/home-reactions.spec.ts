import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { notice } from './auth-kit';
import {
  feedPage,
  mockFeedApi,
  problemReply,
  question,
  signIn,
  type Reply,
  type ReactionCall,
} from './feed-kit';

// WCAG 2.2 AA (product doc, accessibility contract).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type ServerState = {
  counters: { like: number; dislike: number; y: number };
  yThreshold: number;
  conversationOpen: boolean;
  viewerReactions: string[];
};

// The question of the test, as the server has it: 10 likes, 2 dislikes, 49 Y out of 50.
const START: ServerState = {
  counters: { like: 10, dislike: 2, y: 49 },
  yThreshold: 50,
  conversationOpen: false,
  viewerReactions: [],
};

// The backend's rule (R11): one reaction per user. PUT replaces the previous one, DELETE removes the given one.
function serve(state: ServerState, method: 'PUT' | 'DELETE', kind: string): ServerState {
  const previous = state.viewerReactions[0];
  if ((method === 'DELETE' && previous !== kind) || (method === 'PUT' && previous === kind)) {
    return state;
  }
  const counters = { ...state.counters };
  if (previous === 'like' || previous === 'dislike' || previous === 'y') {
    counters[previous] -= 1;
  }
  if (method === 'PUT' && (kind === 'like' || kind === 'dislike' || kind === 'y')) {
    counters[kind] += 1;
  }
  return {
    counters,
    yThreshold: 50,
    conversationOpen: counters.y >= 50,
    viewerReactions: method === 'PUT' ? [kind] : [],
  };
}

async function openQuestion(page: Page, reaction?: (call: ReactionCall) => Reply) {
  const server = { state: START };
  const { reactionCalls } = await mockFeedApi(page, {
    feed: () => feedPage([question('a', 'Question à réagir', ['reactions'])]),
    reaction:
      reaction ??
      ((call) => {
        server.state = serve(server.state, call.method, call.kind);
        if (call.method === 'DELETE') {
          return { status: 204 };
        }
        return {
          status: 200,
          body: {
            questionId: call.questionId,
            counters: server.state.counters,
            viewerReactions: server.state.viewerReactions,
            yThreshold: server.state.yThreshold,
            conversationOpen: server.state.conversationOpen,
          },
        };
      }),
  });
  await page.goto('/home');
  await expect(page.getByText('Question à réagir')).toBeVisible();
  return { reactionCalls };
}

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test('a reaction is set, changed and removed, with the counts and the Y progress', async ({ page }) => {
  const { reactionCalls } = await openQuestion(page);
  const like = page.locator('button[data-kind="like"]');
  const dislike = page.locator('button[data-kind="dislike"]');
  const y = page.locator('button[data-kind="y"]');

  await expect(page.getByText('49/50')).toBeVisible();
  await expect(like).toHaveAccessibleName('10 J’aime');

  // Set with the keyboard: a real button, Enter presses it.
  await like.focus();
  await page.keyboard.press('Enter');
  await expect(like).toHaveAccessibleName('11 J’aime');
  await expect(like).toHaveAttribute('aria-pressed', 'true');

  // Change: the dislike replaces the like.
  await dislike.click();
  await expect(dislike).toHaveAccessibleName('3 Pas d’accord');
  await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveAccessibleName('10 J’aime');
  await expect(like).toHaveAttribute('aria-pressed', 'false');

  // Remove: the active kind clicked again.
  await dislike.click();
  await expect(dislike).toHaveAccessibleName('2 Pas d’accord');
  await expect(dislike).toHaveAttribute('aria-pressed', 'false');

  // Y: the Y progress moves to 50/50, and back to 49/50 when the Y is removed.
  await y.click();
  await expect(page.getByText('50/50')).toBeVisible();
  await expect(y).toHaveAttribute('aria-pressed', 'true');
  await y.click();
  await expect(page.getByText('49/50')).toBeVisible();
  await expect(y).toHaveAttribute('aria-pressed', 'false');

  expect(reactionCalls.map((call) => `${call.method} ${call.kind}`)).toEqual([
    'PUT like',
    'PUT dislike',
    'DELETE dislike',
    'PUT y',
    'DELETE y',
  ]);
  expect(reactionCalls[0]?.csrf).toBe('csrf-e2e');
});

test('a failed reaction is rolled back, and the French message is shown', async ({ page }) => {
  await openQuestion(page, () => problemReply(500, 'Erreur serveur.'));
  const like = page.locator('button[data-kind="like"]');

  await like.click();

  await expect(notice(page)).toContainText('Votre réaction n’a pas été enregistrée. Réessayez.');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like).toHaveAccessibleName('10 J’aime');
  await expect(like).toBeEnabled();
});

test('an account that is not active cannot react, and is told so', async ({ page }) => {
  await openQuestion(page, () => problemReply(403, 'Votre compte n’est pas actif.'));
  const dislike = page.locator('button[data-kind="dislike"]');

  await dislike.click();

  await expect(notice(page)).toContainText(
    'Votre compte n’est pas actif : vous ne pouvez pas réagir pour le moment.',
  );
  await expect(dislike).toHaveAttribute('aria-pressed', 'false');
});

test('the question with a reaction shown has no WCAG 2.2 AA violation', async ({ page }) => {
  await openQuestion(page);
  await page.locator('button[data-kind="like"]').click();
  await expect(page.locator('button[data-kind="like"]')).toHaveAttribute('aria-pressed', 'true');

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  // Guard against an empty run: axe must have checked rules that passed.
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.violations).toEqual([]);
});

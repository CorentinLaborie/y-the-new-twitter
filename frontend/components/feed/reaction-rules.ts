/*
 * Reaction rules of a question (R11: one reaction per user and question; R3: the Y count against yThreshold). Pure functions, so they
 * are easy to test. The page shows the change at once (optimistic update), then keeps the server's state, or restores
 * the previous one when the call fails.
 */

import type { ApiProblem } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import type { FeedQuestion, ReactionKind, ReactionState } from '@/lib/feed-api';

/** The kinds of reaction, in the order of the pills. */
export const REACTION_KINDS: readonly ReactionKind[] = ['like', 'dislike', 'y'];

/** The reaction the viewer has on a question, or null. */
function currentReaction(state: ReactionState): ReactionKind | null {
  return state.viewerReactions[0] ?? null;
}

/**
 * The state after the viewer clicks `kind`. Clicking the active kind again removes it (DELETE). Clicking another kind
 * replaces the previous one (PUT). Counts never go below zero. The Y count is counters.y, so it moves with them.
 * `state` is not changed: the previous state is kept for the rollback.
 */
export function applyReaction(
  state: ReactionState,
  kind: ReactionKind,
): { next: ReactionState; method: 'PUT' | 'DELETE' } {
  const previous = currentReaction(state);
  const counters = { ...state.counters };

  if (previous) {
    counters[previous] = Math.max(0, counters[previous] - 1);
  }

  if (previous === kind) {
    return { next: { ...state, counters, viewerReactions: [] }, method: 'DELETE' };
  }

  counters[kind] += 1;
  return { next: { ...state, counters, viewerReactions: [kind] }, method: 'PUT' };
}

/** The server's answer replaces the optimistic state; a 204 answer (no body) keeps it. */
export function withServerState(state: ReactionState, answer: Partial<ReactionState>): ReactionState {
  return {
    counters: answer.counters ?? state.counters,
    yThreshold: answer.yThreshold ?? state.yThreshold,
    conversationOpen: answer.conversationOpen ?? state.conversationOpen,
    viewerReactions: answer.viewerReactions ?? state.viewerReactions,
  };
}

/** The message under a question whose reaction failed (the page has been rolled back). */
export function reactionFailureMessage(problem: ApiProblem): string {
  return (
    messageForCode(problem) ??
    (problem.status === 403
      ? 'Votre compte n’est pas actif : vous ne pouvez pas réagir pour le moment.'
      : 'Votre réaction n’a pas été enregistrée. Réessayez.')
  );
}

/** The question with its reaction fields replaced; the text and the author stay. */
export function withReactions(question: FeedQuestion, reactions: ReactionState): FeedQuestion {
  return {
    ...question,
    counters: { ...question.counters, ...reactions.counters },
    yThreshold: reactions.yThreshold,
    conversationOpen: reactions.conversationOpen,
    viewerReactions: reactions.viewerReactions,
  };
}

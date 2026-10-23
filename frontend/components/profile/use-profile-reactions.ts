'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  applyReaction,
  reactionFailureMessage,
  withReactions,
  withServerState,
} from '@/components/feed/reaction-rules';
import { deleteReaction, putReaction, type FeedQuestion, type ReactionKind } from '@/lib/feed-api';

/**
 * The reactions of the questions of a profile (B3, R11). The same rules as the home feed: the count changes at once,
 * the server answer replaces it, and a failed call gives the previous state back with a message under the question.
 */
export function useProfileReactions(setQuestions: Dispatch<SetStateAction<FeedQuestion[]>>): {
  pendingIds: readonly string[];
  errors: Readonly<Record<string, string>>;
  react: (question: FeedQuestion, kind: ReactionKind) => void;
} {
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  function replaceQuestion(id: string, update: (question: FeedQuestion) => FeedQuestion) {
    setQuestions((current) => current.map((item) => (item.id === id ? update(item) : item)));
  }

  function react(question: FeedQuestion, kind: ReactionKind) {
    const { next, method } = applyReaction(question, kind);
    setPendingIds((current) => [...current, question.id]);
    setErrors((current) => {
      const rest = { ...current };
      delete rest[question.id];
      return rest;
    });
    replaceQuestion(question.id, (item) => withReactions(item, next));

    const call = method === 'PUT' ? putReaction(question.id, kind) : deleteReaction(question.id, kind);
    call.then((result) => {
      setPendingIds((current) => current.filter((id) => id !== question.id));
      if (!result.ok) {
        replaceQuestion(question.id, () => question);
        setErrors((current) => ({ ...current, [question.id]: reactionFailureMessage(result.problem) }));
        return;
      }
      replaceQuestion(question.id, (item) => withReactions(item, withServerState(next, result.body)));
    });
  }

  return { pendingIds, errors, react };
}

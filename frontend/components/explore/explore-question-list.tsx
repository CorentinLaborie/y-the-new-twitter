'use client';

import { useState } from 'react';
import { deleteReaction, putReaction, type FeedQuestion, type ReactionKind } from '@/lib/feed-api';
import {
  applyReaction,
  reactionFailureMessage,
  withReactions,
  withServerState,
} from '@/components/feed/reaction-rules';
import { QuestionCard } from '@/components/feed/question-card';
import feedStyles from '@/components/feed/feed.module.css';
import styles from './explore.module.css';

/**
 * A list of questions on an Explore screen, with the reactions of the feed: optimistic, rolled back on failure. The
 * questions come from the parent, so a page added later shows at once; only the reactions in progress are kept here.
 */
export function ExploreQuestionList({
  questions,
  label,
  viewer,
  separated = false,
}: {
  questions: FeedQuestion[];
  label: string;
  viewer: { handle: string; suspended: boolean };
  /** A hairline between two questions (the popular questions). */
  separated?: boolean;
}) {
  const [changed, setChanged] = useState<Record<string, FeedQuestion>>({});
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [reactionError, setReactionError] = useState<{ questionId: string; message: string } | null>(null);

  const shown = questions.map((question) => changed[question.id] ?? question);

  function setQuestion(id: string, question: FeedQuestion | null) {
    setChanged((current) => {
      const next = { ...current };
      if (question === null) {
        delete next[id];
      } else {
        next[id] = question;
      }
      return next;
    });
  }

  async function react(question: FeedQuestion, kind: ReactionKind) {
    if (pendingIds.includes(question.id)) {
      return;
    }
    const current = changed[question.id] ?? question;
    const { next, method } = applyReaction(current, kind);
    setQuestion(question.id, withReactions(current, next));
    setPendingIds((ids) => [...ids, question.id]);
    setReactionError(null);
    const result =
      method === 'PUT' ? await putReaction(question.id, kind) : await deleteReaction(question.id, kind);
    setPendingIds((ids) => ids.filter((id) => id !== question.id));
    if (result.ok) {
      setQuestion(question.id, withReactions(current, withServerState(next, result.body)));
      return;
    }
    setQuestion(question.id, null);
    setReactionError({ questionId: question.id, message: reactionFailureMessage(result.problem) });
  }

  return (
    <ul
      className={`${feedStyles.list} ${separated ? styles.separated : ''}`}
      aria-label={label}
      data-separated={separated}
    >
      {shown.map((question) => (
        <li key={question.id}>
          <QuestionCard
            question={question}
            reactionPending={pendingIds.includes(question.id)}
            reactionError={reactionError?.questionId === question.id ? reactionError.message : null}
            onReact={(kind) => void react(question, kind)}
            viewer={viewer}
          />
        </li>
      ))}
    </ul>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Conversation } from '@/components/conversation/conversation';
import { FeedIcon } from '@/components/feed/feed-icon';
import { feedFailureMessage, FeedLoading } from '@/components/feed/feed-states';
import feedStyles from '@/components/feed/feed.module.css';
import { QuestionCard } from '@/components/feed/question-card';
import {
  applyReaction,
  reactionFailureMessage,
  withReactions,
  withServerState,
} from '@/components/feed/reaction-rules';
import { deleteReaction, putReaction, type FeedQuestion, type ReactionKind } from '@/lib/feed-api';
import { getQuestion } from '@/lib/question-detail-api';

type ShareViewProps = {
  questionId: string;
  /** The signed-in handle, read on the server by the page. */
  viewerHandle: string;
};

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; question: FeedQuestion; replyCount: number }
  | { phase: 'not-found' }
  | { phase: 'failed'; message: string };

/**
 * The question and its conversation, read-only (the owner's decision: no reply composer here). The question card
 * keeps the reactions of the feed (one per user, R11). The conversation is shown below it.
 * Page structure: the sr-only h1 "Question" names the page; the question text is the card's paragraph.
 */
export function ShareView({ questionId, viewerHandle }: ShareViewProps) {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [reacting, setReacting] = useState(false);
  const [reactionError, setReactionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getQuestion(questionId).then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        setLoad({ phase: 'ready', question: result.body, replyCount: result.body.counters.reply });
      } else {
        setLoad(
          result.problem.status === 404
            ? { phase: 'not-found' }
            : { phase: 'failed', message: feedFailureMessage(result.problem) },
        );
      }
    });
    return () => {
      active = false;
    };
  }, [questionId, attempt]);

  function retry() {
    setLoad({ phase: 'loading' });
    setAttempt((count) => count + 1);
  }

  function handleReaction(question: FeedQuestion, replyCount: number, kind: ReactionKind) {
    if (reacting) {
      return;
    }
    // Optimistic update, then the server's state; the previous state is restored when the call fails (feed rules).
    const { next, method } = applyReaction(question, kind);
    setReacting(true);
    setReactionError(null);
    setLoad({ phase: 'ready', question: withReactions(question, next), replyCount });

    const reactionCall =
      method === 'PUT' ? putReaction(question.id, kind) : deleteReaction(question.id, kind);
    reactionCall.then((result) => {
      setReacting(false);
      if (!result.ok) {
        setLoad({ phase: 'ready', question, replyCount });
        setReactionError(reactionFailureMessage(result.problem));
        return;
      }
      setLoad({
        phase: 'ready',
        question: withReactions(question, withServerState(next, result.body)),
        replyCount,
      });
    });
  }

  return (
    <main className={feedStyles.feed}>
      <h1 className="y-sr">Question</h1>

      {load.phase === 'loading' ? <FeedLoading /> : null}

      {load.phase === 'not-found' ? (
        <div className="y-empty">
          <span className="y-empty-icon">
            <FeedIcon name="message-circle" size={28} />
          </span>
          <h2>Cette question n’est pas disponible.</h2>
          <p>
            <Link href="/home">Retour à l’accueil</Link>
          </p>
        </div>
      ) : null}

      {load.phase === 'failed' ? (
        <div className="y-errorstate" role="alert">
          <span className="y-errorstate-icon">
            <FeedIcon name="triangle-alert" size={24} />
          </span>
          <h2 className="y-errorstate-title">Impossible de charger la question</h2>
          <p className="y-errorstate-message">{load.message}</p>
          <button type="button" className="y-errorstate-retry" onClick={retry}>
            Réessayer
          </button>
        </div>
      ) : null}

      {load.phase === 'ready' && load.question.removedByModeration === true ? (
        <div className="y-empty">
          <span className="y-empty-icon">
            <FeedIcon name="triangle-alert" size={28} />
          </span>
          <h2>Retirée par la modération</h2>
          <p>Cette question n’est plus visible pour les autres membres de Y. Son texte n’est plus affiché.</p>
          <p>
            <Link href="/home">Retour à l’accueil</Link>
          </p>
        </div>
      ) : null}

      {load.phase === 'ready' && load.question.removedByModeration !== true ? (
        <>
          <QuestionCard
            question={load.question}
            replyCount={load.replyCount}
            reactionPending={reacting}
            reactionError={reactionError}
            onReact={(kind) => handleReaction(load.question, load.replyCount, kind)}
          />
          <Conversation
            questionId={load.question.id}
            yCount={load.question.counters.y}
            yThreshold={load.question.yThreshold}
            conversationOpen={load.question.conversationOpen}
            replyCount={load.replyCount}
            viewerHandle={viewerHandle}
            readOnly
          />
        </>
      ) : null}
    </main>
  );
}

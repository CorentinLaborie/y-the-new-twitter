'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteReaction,
  fetchFeedPage,
  putReaction,
  type FeedPage,
  type FeedTabId,
  type FeedQuestion,
  type ReactionKind,
  type ReactionState,
} from '@/lib/feed-api';
import type { ApiResult } from '@/lib/api-client';
import { Conversation } from '@/components/conversation/conversation';
import { Composer } from './composer';
import { FeedIcon } from './feed-icon';
import {
  CONNECTION_FAILURE_MESSAGE,
  feedFailureMessage,
  FeedEmpty,
  FollowingEmpty,
  FeedError,
  FeedLoading,
} from './feed-states';
import { applyReaction, reactionFailureMessage, withReactions, withServerState } from './reaction-rules';
import styles from './feed.module.css';
import { QuestionCard } from './question-card';

type Phase = 'loading' | 'ready' | 'failed';
type NextPageStatus = 'idle' | 'loading' | 'failed';

type FeedState = {
  /** State of the first page (or of its retry). */
  phase: Phase;
  /** Message of the failed first page, shown by the error state. */
  loadError: string;
  /** The trending block, from the first page: the top 10 by reactions in the last 24 h. Hidden when empty. */
  trendingQuestions: FeedQuestion[];
  /** The list, the most recent first. */
  questions: FeedQuestion[];
  /** Questions found by the check of the first page, not shown yet (the pill "Afficher N nouvelles questions"). */
  newQuestions: FeedQuestion[];
  nextCursor: string | null;
  /** State of the next page, loaded with "Voir plus". */
  nextPageStatus: NextPageStatus;
  /** Questions whose reaction call is in flight: their reactions are off until the answer comes. */
  pendingReactionIds: string[];
  /** The failed reaction, rolled back, with its message. */
  reactionError: { questionId: string; message: string } | null;
};

const INITIAL_STATE: FeedState = {
  phase: 'loading',
  loadError: '',
  trendingQuestions: [],
  questions: [],
  newQuestions: [],
  nextCursor: null,
  nextPageStatus: 'idle',
  pendingReactionIds: [],
  reactionError: null,
};

/** How often the first page is checked for new questions, while the feed is shown. */
const NEW_QUESTIONS_CHECK_MS = 30_000;

/** The questions of `first`, then those of `second` that `first` does not already have. */
function withoutDuplicates(first: FeedQuestion[], second: FeedQuestion[]): FeedQuestion[] {
  const inFirst = new Set(first.map((question) => question.id));
  return [...first, ...second.filter((question) => !inFirst.has(question.id))];
}

/** Questions of a page that the feed neither shows (trending, list) nor holds as new. */
function questionsNotShown(page: FeedQuestion[], state: FeedState): FeedQuestion[] {
  const known = new Set(
    [...state.trendingQuestions, ...state.questions, ...state.newQuestions].map((question) => question.id),
  );
  return page.filter((question) => !known.has(question.id));
}

/** The reply count of a question, from counters.reply. */
function replyCountOf(question: FeedQuestion): number {
  return question.counters.reply;
}

/** withReactions, with the reply count of the question kept: the reaction answers do not send it. */
function withReactionsKeepingReplies(question: FeedQuestion, reactions: ReactionState): FeedQuestion {
  const updated = withReactions(question, reactions);
  return { ...updated, counters: { ...updated.counters, reply: question.counters.reply } };
}

function newQuestionsLabel(count: number): string {
  return count > 1 ? `Afficher ${count} nouvelles questions` : `Afficher ${count} nouvelle question`;
}

/**
 * The "Pour vous" feed: one list, the most recent first (M2 decision 3), with the composer on top.
 * Loading, empty and error states follow the Home boards. The list is cursor-paginated ("Voir plus").
 * While the feed is shown, the first page is checked for new questions, which the pill shows until clicked.
 */
export function HomeFeed({
  displayName,
  viewerHandle,
  suspended,
  tab = 'for-you',
}: {
  displayName: string;
  viewerHandle: string | null;
  /** True for a suspended account: the composer keeps publishing off. */
  suspended: boolean;
  /** The tab shown: the parent gives a new key to each tab, so each one starts from its own first page. */
  tab?: FeedTabId;
}) {
  const [state, setState] = useState<FeedState>(INITIAL_STATE);
  /** The questions whose conversation is open under their card. */
  const [openConversations, setOpenConversations] = useState<ReadonlySet<string>>(() => new Set());

  const applyFirstPage = useCallback((result: ApiResult<FeedPage>) => {
    setState((current) =>
      result.ok
        ? {
            ...current,
            phase: 'ready',
            trendingQuestions: result.body.trending,
            questions: withoutDuplicates(current.questions, result.body.questions),
            nextCursor: result.body.nextCursor,
          }
        : { ...current, phase: 'failed', loadError: feedFailureMessage(result.problem) },
    );
  }, []);

  const checkForNewQuestions = useCallback(() => {
    fetchFeedPage(undefined, tab).then((result) => {
      if (!result.ok) {
        return;
      }
      setState((current) =>
        current.phase === 'ready'
          ? {
              ...current,
              newQuestions: [...current.newQuestions, ...questionsNotShown(result.body.questions, current)],
            }
          : current,
      );
    });
  }, [tab]);

  useEffect(() => {
    fetchFeedPage(undefined, tab).then(applyFirstPage);
  }, [applyFirstPage, tab]);

  const {
    phase,
    loadError,
    trendingQuestions,
    questions,
    newQuestions,
    nextCursor,
    nextPageStatus,
    pendingReactionIds,
    reactionError,
  } = state;

  useEffect(() => {
    if (phase !== 'ready') {
      return;
    }
    const timer = setInterval(checkForNewQuestions, NEW_QUESTIONS_CHECK_MS);
    return () => clearInterval(timer);
  }, [phase, checkForNewQuestions]);

  /** Unfollowing an author on the "Abonnements" tab takes their questions off the list at once (section 7.3). */
  function removeAuthorQuestions(handle: string) {
    setState((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.author.handle !== handle),
    }));
  }

  function retryFirstPage() {
    setState((current) => ({ ...current, phase: 'loading' }));
    fetchFeedPage(undefined, tab).then(applyFirstPage);
  }

  function loadMore(cursor: string) {
    setState((current) => ({ ...current, nextPageStatus: 'loading' }));
    fetchFeedPage(cursor, tab).then((result) => {
      setState((current) =>
        result.ok
          ? {
              ...current,
              questions: withoutDuplicates(current.questions, result.body.questions),
              nextCursor: result.body.nextCursor,
              nextPageStatus: 'idle',
            }
          : { ...current, nextPageStatus: 'failed' },
      );
    });
  }

  function showNewQuestions() {
    setState((current) => ({
      ...current,
      questions: withoutDuplicates(current.newQuestions, current.questions),
      newQuestions: [],
    }));
  }

  function handleReaction(question: FeedQuestion, kind: ReactionKind) {
    const { next, method } = applyReaction(question, kind);
    // The same question can be shown in the trending block and in the list: both copies follow the reaction.
    const replaceInList = (list: FeedQuestion[], value: FeedQuestion) =>
      list.map((shown) => (shown.id === question.id ? value : shown));

    setState((current) => ({
      ...current,
      pendingReactionIds: [...current.pendingReactionIds, question.id],
      reactionError: current.reactionError?.questionId === question.id ? null : current.reactionError,
      trendingQuestions: replaceInList(current.trendingQuestions, withReactions(question, next)),
      questions: replaceInList(current.questions, withReactions(question, next)),
    }));

    const reactionCall =
      method === 'PUT' ? putReaction(question.id, kind) : deleteReaction(question.id, kind);
    reactionCall.then((result) => {
      setState((current) => {
        const pendingReactionIds = current.pendingReactionIds.filter((id) => id !== question.id);
        if (!result.ok) {
          return {
            ...current,
            pendingReactionIds,
            trendingQuestions: replaceInList(current.trendingQuestions, question),
            questions: replaceInList(current.questions, question),
            reactionError: { questionId: question.id, message: reactionFailureMessage(result.problem) },
          };
        }
        const shown =
          current.questions.find((item) => item.id === question.id) ??
          current.trendingQuestions.find((item) => item.id === question.id) ??
          question;
        const reactions = withServerState(next, result.body);
        return {
          ...current,
          pendingReactionIds,
          trendingQuestions: replaceInList(
            current.trendingQuestions,
            withReactionsKeepingReplies(shown, reactions),
          ),
          questions: replaceInList(current.questions, withReactionsKeepingReplies(shown, reactions)),
        };
      });
    });
  }

  function toggleConversation(questionId: string) {
    setOpenConversations((current) => {
      const next = new Set(current);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  /** The new reply count of a question, after a reply is posted or deleted in its open conversation. */
  function handleReplyCountChange(questionId: string, count: number) {
    const withCount = (list: FeedQuestion[]) =>
      list.map((shown) =>
        shown.id === questionId ? { ...shown, counters: { ...shown.counters, reply: count } } : shown,
      );
    setState((current) => ({
      ...current,
      trendingQuestions: withCount(current.trendingQuestions),
      questions: withCount(current.questions),
    }));
  }

  function renderQuestionCard(question: FeedQuestion) {
    const conversationShown = openConversations.has(question.id);
    return (
      <QuestionCard
        question={question}
        reactionPending={pendingReactionIds.includes(question.id)}
        reactionError={reactionError?.questionId === question.id ? reactionError.message : null}
        onReact={(kind) => handleReaction(question, kind)}
        replyCount={replyCountOf(question)}
        onOpenConversation={() => toggleConversation(question.id)}
        conversationOpen={conversationShown}
        viewer={viewerHandle === null ? undefined : { handle: viewerHandle, suspended }}
        onAuthorUnfollowed={
          tab === 'following' ? () => removeAuthorQuestions(question.author.handle) : undefined
        }
      />
    );
  }

  /**
   * The card, and under it the conversation when it is open. An open conversation is framed with its question: both are
   * one white card (Replies-Framed boards).
   */
  function renderQuestionItem(question: FeedQuestion) {
    // The wrapper is always there, so the card is not remounted when its conversation opens or closes (focus kept).
    const open = openConversations.has(question.id);

    return (
      <div className={open ? styles.thread : undefined}>
        {renderQuestionCard(question)}
        {open ? (
          <Conversation
            questionId={question.id}
            yCount={question.counters.y}
            yThreshold={question.yThreshold}
            conversationOpen={question.conversationOpen}
            replyCount={replyCountOf(question)}
            viewerHandle={viewerHandle}
            onReplyCountChange={(count) => handleReplyCountChange(question.id, count)}
          />
        ) : null}
      </div>
    );
  }

  function handleQuestionPosted(question: FeedQuestion) {
    setState((current) => ({
      ...current,
      questions: [question, ...current.questions.filter((shown) => shown.id !== question.id)],
      newQuestions: current.newQuestions.filter((waiting) => waiting.id !== question.id),
    }));
  }

  return (
    <div className={styles.feed}>
      <Composer displayName={displayName} suspended={suspended} onPosted={handleQuestionPosted} />

      {trendingQuestions.length > 0 ? (
        <section className={styles.trending} aria-labelledby="trending-title">
          <h2 id="trending-title" className={styles.trendingTitle}>
            Tendances pour vous
          </h2>
          <ul className={styles.list}>
            {trendingQuestions.map((question) => (
              <li key={question.id}>{renderQuestionItem(question)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {newQuestions.length > 0 ? (
        <button type="button" className={styles.newQuestions} onClick={showNewQuestions}>
          <FeedIcon name="plus" size={14} />
          {newQuestionsLabel(newQuestions.length)}
        </button>
      ) : null}

      {questions.length > 0 ? (
        <ul className={styles.list} aria-label="Questions du fil">
          {questions.map((question) => (
            <li key={question.id}>{renderQuestionItem(question)}</li>
          ))}
        </ul>
      ) : null}
      {questions.length === 0 && phase === 'loading' ? <FeedLoading /> : null}
      {trendingQuestions.length === 0 && questions.length === 0 && phase === 'ready' ? (
        tab === 'following' ? (
          <FollowingEmpty />
        ) : (
          <FeedEmpty />
        )
      ) : null}
      {phase === 'failed' ? <FeedError message={loadError} onRetry={retryFirstPage} /> : null}

      {phase === 'ready' && nextPageStatus === 'failed' && nextCursor ? (
        <FeedError message={CONNECTION_FAILURE_MESSAGE} onRetry={() => loadMore(nextCursor)} />
      ) : null}
      {phase === 'ready' && nextCursor && nextPageStatus !== 'failed' ? (
        <button
          type="button"
          className={`y-loadmore ${nextPageStatus === 'loading' ? 'is-loading' : ''}`}
          disabled={nextPageStatus === 'loading'}
          aria-busy={nextPageStatus === 'loading' ? true : undefined}
          onClick={() => loadMore(nextCursor)}
        >
          {nextPageStatus === 'loading' ? <span className="y-loadmore-spinner" aria-hidden="true" /> : null}
          {nextPageStatus === 'loading' ? 'Chargement…' : 'Voir plus'}
        </button>
      ) : null}
    </div>
  );
}

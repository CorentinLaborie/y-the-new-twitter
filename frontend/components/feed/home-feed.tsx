'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteReaction,
  fetchFeedPage,
  putReaction,
  type FeedPage,
  type FeedQuestion,
  type FeedResult,
  type ReactionKind,
} from '@/lib/feed-api';
import { Composer } from './composer';
import { FeedIcon } from './feed-icon';
import { FeedEmpty, FeedError, FeedLoading } from './feed-states';
import { applyReaction, reactionFailureMessage, withReactions, withServerState } from './reaction-rules';
import styles from './feed.module.css';
import { QuestionCard } from './question-card';

type Phase = 'loading' | 'ready' | 'failed';
type MoreStatus = 'idle' | 'loading' | 'failed';

type FeedState = {
  /** State of the first page (or of its retry). */
  phase: Phase;
  /** The trending block, from the first page: the top 10 by reactions in the last 24 h. Hidden when empty. */
  trending: FeedQuestion[];
  items: FeedQuestion[];
  /** Questions found by the check of the first page, not shown yet (the pill "Afficher N nouvelles questions"). */
  pending: FeedQuestion[];
  nextCursor: string | null;
  /** State of the next page, loaded with "Voir plus". */
  more: MoreStatus;
  /** Questions whose reaction call is in flight: their reactions are off until the answer comes. */
  busy: string[];
  /** The failed reaction, rolled back, with its message. */
  reactionError: { questionId: string; message: string } | null;
};

const INITIAL_STATE: FeedState = {
  phase: 'loading',
  trending: [],
  items: [],
  pending: [],
  nextCursor: null,
  more: 'idle',
  busy: [],
  reactionError: null,
};

/** How often the first page is checked for new questions, while the feed is shown. */
const NEW_QUESTIONS_CHECK_MS = 30_000;

/** Adds the incoming questions after the current ones, without repeating one already shown. */
function appendUnique(current: FeedQuestion[], incoming: FeedQuestion[]): FeedQuestion[] {
  const shown = new Set(current.map((question) => question.id));
  return [...current, ...incoming.filter((question) => !shown.has(question.id))];
}

/** Questions of a page that the feed neither shows (trending, list) nor holds as pending. */
function unseen(page: FeedQuestion[], state: FeedState): FeedQuestion[] {
  const known = new Set([...state.trending, ...state.items, ...state.pending].map((question) => question.id));
  return page.filter((question) => !known.has(question.id));
}

function newQuestionsLabel(count: number): string {
  return count > 1 ? `Afficher ${count} nouvelles questions` : `Afficher ${count} nouvelle question`;
}

/**
 * The "Pour vous" feed: one list, the most recent first (M2 decision 3), with the composer on top.
 * Loading, empty and error states follow the Home boards. The list is cursor-paginated ("Voir plus").
 * While the feed is shown, the first page is checked for new questions, which the pill shows until clicked.
 */
export function HomeFeed({ displayName }: { displayName: string }) {
  const [state, setState] = useState<FeedState>(INITIAL_STATE);

  const applyFirstPage = useCallback((result: FeedResult<FeedPage>) => {
    setState((current) =>
      result.ok
        ? {
            ...current,
            phase: 'ready',
            trending: result.body.trending,
            items: appendUnique(current.items, result.body.items),
            nextCursor: result.body.nextCursor,
          }
        : { ...current, phase: 'failed' },
    );
  }, []);

  const checkNewQuestions = useCallback(() => {
    fetchFeedPage().then((result) => {
      if (!result.ok) {
        return;
      }
      setState((current) =>
        current.phase === 'ready'
          ? { ...current, pending: [...current.pending, ...unseen(result.body.items, current)] }
          : current,
      );
    });
  }, []);

  useEffect(() => {
    fetchFeedPage().then(applyFirstPage);
  }, [applyFirstPage]);

  const { phase, trending, items, pending, nextCursor, more, busy, reactionError } = state;

  useEffect(() => {
    if (phase !== 'ready') {
      return;
    }
    const timer = setInterval(checkNewQuestions, NEW_QUESTIONS_CHECK_MS);
    return () => clearInterval(timer);
  }, [phase, checkNewQuestions]);

  function retryFirstPage() {
    setState((current) => ({ ...current, phase: 'loading' }));
    fetchFeedPage().then(applyFirstPage);
  }

  function loadMore(cursor: string) {
    setState((current) => ({ ...current, more: 'loading' }));
    fetchFeedPage(cursor).then((result) => {
      setState((current) =>
        result.ok
          ? {
              ...current,
              items: appendUnique(current.items, result.body.items),
              nextCursor: result.body.nextCursor,
              more: 'idle',
            }
          : { ...current, more: 'failed' },
      );
    });
  }

  function showNewQuestions() {
    setState((current) => ({
      ...current,
      items: appendUnique(current.pending, current.items),
      pending: [],
    }));
  }

  function reactTo(question: FeedQuestion, kind: ReactionKind) {
    const { next, request } = applyReaction(question, kind);
    // The same question can be shown in the trending block and in the list: both copies follow the reaction.
    const replaceIn = (list: FeedQuestion[], value: FeedQuestion) =>
      list.map((shown) => (shown.id === question.id ? value : shown));

    setState((current) => ({
      ...current,
      busy: [...current.busy, question.id],
      reactionError: current.reactionError?.questionId === question.id ? null : current.reactionError,
      trending: replaceIn(current.trending, withReactions(question, next)),
      items: replaceIn(current.items, withReactions(question, next)),
    }));

    const call = request === 'put' ? putReaction(question.id, kind) : deleteReaction(question.id, kind);
    call.then((result) => {
      setState((current) => {
        const busy = current.busy.filter((id) => id !== question.id);
        if (!result.ok) {
          return {
            ...current,
            busy,
            trending: replaceIn(current.trending, question),
            items: replaceIn(current.items, question),
            reactionError: { questionId: question.id, message: reactionFailureMessage(result.problem) },
          };
        }
        const shown = current.items.find((item) => item.id === question.id) ?? question;
        const reactions = withServerState(next, result.body);
        return {
          ...current,
          busy,
          trending: replaceIn(current.trending, withReactions(shown, reactions)),
          items: replaceIn(current.items, withReactions(shown, reactions)),
        };
      });
    });
  }

  function renderCard(question: FeedQuestion) {
    return (
      <QuestionCard
        question={question}
        busy={busy.includes(question.id)}
        reactionError={reactionError?.questionId === question.id ? reactionError.message : null}
        onReact={(kind) => reactTo(question, kind)}
      />
    );
  }

  function handlePosted(question: FeedQuestion) {
    setState((current) => ({
      ...current,
      items: [question, ...current.items.filter((shown) => shown.id !== question.id)],
      pending: current.pending.filter((waiting) => waiting.id !== question.id),
    }));
  }

  return (
    <div className={styles.feed}>
      <Composer displayName={displayName} onPosted={handlePosted} />

      {trending.length > 0 ? (
        <section className={styles.trending} aria-labelledby="trending-title">
          <h2 id="trending-title" className={styles.trendingTitle}>
            Tendances sur 24 h
          </h2>
          <ul className={styles.list}>
            {trending.map((question) => (
              <li key={question.id}>{renderCard(question)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <button type="button" className={styles.newQuestions} onClick={showNewQuestions}>
          <FeedIcon name="plus" size={14} />
          {newQuestionsLabel(pending.length)}
        </button>
      ) : null}

      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((question) => (
            <li key={question.id}>{renderCard(question)}</li>
          ))}
        </ul>
      ) : null}
      {items.length === 0 && phase === 'loading' ? <FeedLoading /> : null}
      {trending.length === 0 && items.length === 0 && phase === 'ready' ? <FeedEmpty /> : null}
      {phase === 'failed' ? <FeedError onRetry={retryFirstPage} /> : null}

      {phase === 'ready' && more === 'failed' && nextCursor ? (
        <FeedError onRetry={() => loadMore(nextCursor)} />
      ) : null}
      {phase === 'ready' && nextCursor && more !== 'failed' ? (
        <button
          type="button"
          className={`y-loadmore ${more === 'loading' ? 'is-loading' : ''}`}
          disabled={more === 'loading'}
          aria-busy={more === 'loading' ? true : undefined}
          onClick={() => loadMore(nextCursor)}
        >
          {more === 'loading' ? <span className="y-loadmore-spinner" aria-hidden="true" /> : null}
          {more === 'loading' ? 'Chargement…' : 'Voir plus'}
        </button>
      ) : null}
    </div>
  );
}

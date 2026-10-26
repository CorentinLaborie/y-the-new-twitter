'use client';

import { useEffect, useState } from 'react';
import type { ApiResult } from '@/lib/api-client';
import { fetchBookmarkPage, type BookmarkPage } from '@/lib/bookmarks-api';
import { deleteReaction, putReaction, type FeedQuestion, type ReactionKind } from '@/lib/feed-api';
import {
  applyReaction,
  reactionFailureMessage,
  withReactions,
  withServerState,
} from '@/components/feed/reaction-rules';
import { FeedIcon } from '@/components/feed/feed-icon';
import { feedFailureMessage, FeedError, FeedLoading } from '@/components/feed/feed-states';
import { QuestionCard } from '@/components/feed/question-card';
import feedStyles from '@/components/feed/feed.module.css';

type Phase = 'loading' | 'ready' | 'failed';

type ListState = {
  phase: Phase;
  loadError: string;
  questions: FeedQuestion[];
  nextCursor: string | null;
  nextPageStatus: 'idle' | 'loading' | 'failed';
  /** Questions whose reaction call is in flight: their reactions are off until the answer comes. */
  pendingReactionIds: string[];
  /** The failed reaction, rolled back, with its message. */
  reactionError: { questionId: string; message: string } | null;
};

const INITIAL_STATE: ListState = {
  phase: 'loading',
  loadError: '',
  questions: [],
  nextCursor: null,
  nextPageStatus: 'idle',
  pendingReactionIds: [],
  reactionError: null,
};

/** The list state after the first page: its questions, or the failure with its message. */
function firstPageState(result: ApiResult<BookmarkPage>): ListState {
  if (result.ok) {
    return { ...INITIAL_STATE, phase: 'ready', ...result.body };
  }

  return { ...INITIAL_STATE, phase: 'failed', loadError: feedFailureMessage(result.problem) };
}

/** The empty saved list (Bookmarks-Empty boards): what it holds, and how to fill it. No action, the feed is one tab away. */
function SavedEmpty() {
  return (
    <div className="y-empty">
      <span className="y-empty-icon">
        <FeedIcon name="message-circle" size={28} />
      </span>
      <h2>Aucune question enregistrée</h2>
      <p>Enregistrez une question pour la retrouver ici.</p>
    </div>
  );
}

/**
 * The saved questions of the viewer (L4, section 7). The list is the newest save first, with "Voir plus" pages. A
 * question unsaved here leaves the list at once. Reactions work as in the feed: optimistic, rolled back on failure.
 */
export function BookmarksScreen({
  viewerHandle,
  viewerSuspended,
}: {
  viewerHandle: string;
  viewerSuspended: boolean;
}) {
  const [state, setState] = useState<ListState>(INITIAL_STATE);

  useEffect(() => {
    let current = true;
    void fetchBookmarkPage().then((result) => {
      if (current) {
        setState(firstPageState(result));
      }
    });

    return () => {
      current = false;
    };
  }, []);

  async function loadNextPage() {
    if (state.nextCursor === null || state.nextPageStatus === 'loading') {
      return;
    }
    setState((current) => ({ ...current, nextPageStatus: 'loading' }));
    const result = await fetchBookmarkPage(state.nextCursor);
    if (result.ok) {
      setState((current) => ({
        ...current,
        questions: [...current.questions, ...result.body.questions],
        nextCursor: result.body.nextCursor,
        nextPageStatus: 'idle',
      }));
      return;
    }
    setState((current) => ({ ...current, nextPageStatus: 'failed' }));
  }

  function replaceQuestion(id: string, change: (question: FeedQuestion) => FeedQuestion) {
    setState((current) => ({
      ...current,
      questions: current.questions.map((question) => (question.id === id ? change(question) : question)),
    }));
  }

  async function react(question: FeedQuestion, kind: ReactionKind) {
    if (state.pendingReactionIds.includes(question.id)) {
      return;
    }
    const { next, method } = applyReaction(question, kind);
    replaceQuestion(question.id, (current) => withReactions(current, next));
    setState((current) => ({
      ...current,
      pendingReactionIds: [...current.pendingReactionIds, question.id],
      reactionError: null,
    }));
    const result =
      method === 'PUT' ? await putReaction(question.id, kind) : await deleteReaction(question.id, kind);
    setState((current) => ({
      ...current,
      pendingReactionIds: current.pendingReactionIds.filter((id) => id !== question.id),
    }));
    if (result.ok) {
      replaceQuestion(question.id, (current) => withReactions(current, withServerState(next, result.body)));
      return;
    }
    replaceQuestion(question.id, () => question);
    setState((current) => ({
      ...current,
      reactionError: { questionId: question.id, message: reactionFailureMessage(result.problem) },
    }));
  }

  if (state.phase === 'loading') {
    return <FeedLoading />;
  }
  if (state.phase === 'failed') {
    return (
      <FeedError
        message={state.loadError}
        onRetry={() => {
          setState(INITIAL_STATE);
          void fetchBookmarkPage().then((result) => setState(firstPageState(result)));
        }}
      />
    );
  }
  if (state.questions.length === 0) {
    return <SavedEmpty />;
  }

  return (
    <section aria-label="Questions enregistrées">
      <ul className={feedStyles.list} aria-label="Questions enregistrées">
        {state.questions.map((question) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              reactionPending={state.pendingReactionIds.includes(question.id)}
              reactionError={
                state.reactionError?.questionId === question.id ? state.reactionError.message : null
              }
              onReact={(kind) => void react(question, kind)}
              viewer={{ handle: viewerHandle, suspended: viewerSuspended }}
              onBookmarkChange={(saved) => {
                if (!saved) {
                  setState((current) => ({
                    ...current,
                    questions: current.questions.filter((item) => item.id !== question.id),
                  }));
                }
              }}
            />
          </li>
        ))}
      </ul>
      {state.nextCursor !== null ? (
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 16 }}
        >
          <button
            type="button"
            className="y-loadmore"
            onClick={() => void loadNextPage()}
            disabled={state.nextPageStatus === 'loading'}
          >
            {state.nextPageStatus === 'loading' ? 'Chargement…' : 'Voir plus'}
          </button>
          {state.nextPageStatus === 'failed' ? (
            <p role="alert" className="y-errorstate-message">
              La page suivante n’a pas pu être chargée. Réessayez.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

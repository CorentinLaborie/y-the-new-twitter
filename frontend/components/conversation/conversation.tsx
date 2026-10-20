'use client';

import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/auth/notice';
import { feedFailureMessage } from '@/components/feed/feed-states';
import styles from '@/components/feed/feed.module.css';
import type { ApiProblem } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import {
  deleteReply,
  listReplies,
  removeReplyReaction,
  setReplyReaction,
  type ReplyReactionKind,
  type ReplyReactionResult,
  type ReplyView,
} from '@/lib/replies-api';
import { ConversationClosed, RepliesError, RepliesLoading } from './conversation-states';
import { ReplyComposer } from './reply-composer';
import { ReplyItem } from './reply-item';

type ConversationProps = {
  questionId: string;
  /** Y count of the question, shown while the conversation is closed. */
  yCount: number;
  /** Y count at which the conversation opens (Y_CONVERSATION_THRESHOLD, 50 by default). */
  yThreshold: number;
  conversationOpen: boolean;
  /** Number of replies of the question, as the feed or the share view gives it. */
  replyCount: number;
  viewerHandle: string | null;
  /** The share view: the replies are shown, without the composer. */
  readOnly?: boolean;
  /** Called with the new reply count after the viewer posts or deletes a reply (the count the caption shows). */
  onReplyCountChange?: (count: number) => void;
};

/** Replies per page: the first page and each "Voir plus de réponses" (the API default). */
const PAGE_SIZE = 20;

const REACTION_FAILURE_MESSAGE = 'Votre réaction n’a pas été enregistrée. Réessayez.';
const DELETE_FAILURE_MESSAGE = 'Votre réponse n’a pas été supprimée. Réessayez.';
const MORE_FAILURE_MESSAGE = 'Les réponses suivantes n’ont pas pu être chargées. Réessayez.';

type ListState = {
  /** The question these replies belong to: the answers of another question are ignored. */
  questionId: string;
  phase: 'loading' | 'ready' | 'failed';
  /** Message of the failed first page. */
  loadError: string;
  /** Oldest first, as the API returns them. */
  replies: ReplyView[];
  nextCursor: string | null;
  loadingMore: boolean;
  moreFailed: boolean;
  /** Replies whose reaction call is in flight: their reactions are off until the answer comes. */
  pendingReactionIds: string[];
  /** Message of a reaction or a deletion that failed (rolled back). */
  actionError: string | null;
};

function initialList(questionId: string): ListState {
  return {
    questionId,
    phase: 'loading',
    loadError: '',
    replies: [],
    nextCursor: null,
    loadingMore: false,
    moreFailed: false,
    pendingReactionIds: [],
    actionError: null,
  };
}

function isApiProblem(error: unknown): error is ApiProblem {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number';
}

/** The French text of a refusal with a known code, or the fallback text. */
function refusalMessage(error: unknown, fallback: string): string {
  return (isApiProblem(error) ? messageForCode(error) : null) ?? fallback;
}

/** The replies of `incoming` that `current` does not have yet, after `current`. */
function appendNew(current: ReplyView[], incoming: ReplyView[]): ReplyView[] {
  const known = new Set(current.map((reply) => reply.id));
  return [...current, ...incoming.filter((reply) => !known.has(reply.id))];
}

/** The reply after the viewer toggles `kind`: on when it is off, off when it is on. The two kinds are independent (R2). */
function toggledReply(reply: ReplyView, kind: ReplyReactionKind): ReplyView {
  const active = reply.viewerReactions.includes(kind);
  return {
    ...reply,
    counters: { ...reply.counters, [kind]: Math.max(0, reply.counters[kind] + (active ? -1 : 1)) },
    viewerReactions: active
      ? reply.viewerReactions.filter((item) => item !== kind)
      : [...reply.viewerReactions, kind],
  };
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

function mapReply(
  replies: ReplyView[],
  replyId: string,
  change: (reply: ReplyView) => ReplyView,
): ReplyView[] {
  return replies.map((reply) => (reply.id === replyId ? change(reply) : reply));
}

/**
 * The conversation under a question (Conversation boards). Closed under the Y threshold: the line with the count, and
 * nothing else (F2). Open: the replies, oldest first, "Voir plus de réponses" for the next page (F4), the reactions
 * (F5), the deletion of one's own reply (F6) and the composer (F3), unless the view is read-only.
 */
export function Conversation({
  questionId,
  yCount,
  yThreshold,
  conversationOpen,
  replyCount,
  viewerHandle,
  readOnly = false,
  onReplyCountChange,
}: ConversationProps) {
  const [listState, setListState] = useState<ListState>(() => initialList(questionId));
  const [attempt, setAttempt] = useState(0);
  // The count shown in the caption: the prop, moved by the replies this view posts or deletes.
  const [countState, setCountState] = useState({ base: replyCount, value: replyCount });

  const list = listState.questionId === questionId ? listState : initialList(questionId);
  const total = countState.base === replyCount ? countState.value : replyCount;
  // The latest count, read when a post or a deletion answers: its handler may have been created before the last change.
  const latestTotal = useRef(total);
  useEffect(() => {
    latestTotal.current = total;
  });

  useEffect(() => {
    if (!conversationOpen) {
      return;
    }
    let current = true;
    listReplies(questionId, { limit: PAGE_SIZE }).then(
      (page) => {
        if (current) {
          setListState({
            ...initialList(questionId),
            phase: 'ready',
            replies: page.items,
            nextCursor: page.nextCursor,
          });
        }
      },
      (problem: ApiProblem) => {
        if (current) {
          setListState({
            ...initialList(questionId),
            phase: 'failed',
            loadError: feedFailureMessage(problem),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [questionId, conversationOpen, attempt]);

  function shiftCount(delta: number) {
    const next = latestTotal.current + delta;
    latestTotal.current = next;
    setCountState({ base: replyCount, value: next });
    onReplyCountChange?.(next);
  }

  function retryFirstPage() {
    setListState(initialList(questionId));
    setAttempt((value) => value + 1);
  }

  function loadMore() {
    const cursor = list.nextCursor;
    if (cursor === null || list.loadingMore) {
      return;
    }
    setListState((state) =>
      state.questionId === questionId ? { ...state, loadingMore: true, moreFailed: false } : state,
    );
    listReplies(questionId, { cursor, limit: PAGE_SIZE }).then(
      (page) =>
        setListState((state) =>
          state.questionId === questionId
            ? {
                ...state,
                replies: appendNew(state.replies, page.items),
                nextCursor: page.nextCursor,
                loadingMore: false,
              }
            : state,
        ),
      () =>
        setListState((state) =>
          state.questionId === questionId ? { ...state, loadingMore: false, moreFailed: true } : state,
        ),
    );
  }

  function react(reply: ReplyView, kind: ReplyReactionKind) {
    if (list.pendingReactionIds.includes(reply.id)) {
      return;
    }
    const removing = reply.viewerReactions.includes(kind);
    const request: Promise<ReplyReactionResult | null> = removing
      ? removeReplyReaction(reply.id, kind).then(() => null)
      : setReplyReaction(reply.id, kind);

    // The change shows at once; the server's counters replace it when the call succeeds.
    setListState((state) =>
      state.questionId === questionId
        ? {
            ...state,
            replies: mapReply(state.replies, reply.id, () => toggledReply(reply, kind)),
            pendingReactionIds: [...state.pendingReactionIds, reply.id],
            actionError: null,
          }
        : state,
    );
    request.then(
      (result) =>
        setListState((state) =>
          state.questionId === questionId
            ? {
                ...state,
                replies: mapReply(state.replies, reply.id, (current) =>
                  result
                    ? { ...current, counters: result.counts, viewerReactions: result.viewerReactions }
                    : current,
                ),
                pendingReactionIds: withoutId(state.pendingReactionIds, reply.id),
              }
            : state,
        ),
      (error: unknown) =>
        setListState((state) =>
          state.questionId === questionId
            ? {
                ...state,
                replies: mapReply(state.replies, reply.id, () => reply),
                pendingReactionIds: withoutId(state.pendingReactionIds, reply.id),
                actionError: refusalMessage(error, REACTION_FAILURE_MESSAGE),
              }
            : state,
        ),
    );
  }

  function removeReply(reply: ReplyView) {
    deleteReply(reply.id).then(
      () => {
        setListState((state) =>
          state.questionId === questionId
            ? { ...state, replies: state.replies.filter((item) => item.id !== reply.id), actionError: null }
            : state,
        );
        shiftCount(-1);
      },
      (error: unknown) =>
        setListState((state) =>
          state.questionId === questionId
            ? { ...state, actionError: refusalMessage(error, DELETE_FAILURE_MESSAGE) }
            : state,
        ),
    );
  }

  function handlePosted(reply: ReplyView) {
    const alreadyShown = list.replies.some((item) => item.id === reply.id);
    setListState((state) =>
      state.questionId === questionId &&
      state.phase === 'ready' &&
      !state.replies.some((item) => item.id === reply.id)
        ? { ...state, replies: [...state.replies, reply] }
        : state,
    );
    if (!alreadyShown) {
      shiftCount(1);
    }
  }

  if (!conversationOpen) {
    return <ConversationClosed yCount={yCount} yThreshold={yThreshold} />;
  }

  const hasMore = list.nextCursor !== null;

  return (
    <section aria-label="Réponses à la question" className={styles.list}>
      <h2 className={styles.name}>Réponses</h2>
      {list.actionError ? <Notice tone="error">{list.actionError}</Notice> : null}
      {list.phase === 'loading' ? <RepliesLoading /> : null}
      {list.phase === 'failed' ? <RepliesError message={list.loadError} onRetry={retryFirstPage} /> : null}
      {list.phase === 'ready' ? (
        <>
          {list.replies.length > 0 ? (
            <ol className={styles.list}>
              {list.replies.map((reply) => (
                <li key={reply.id}>
                  <ReplyItem
                    reply={reply}
                    viewerHandle={viewerHandle}
                    reactionPending={list.pendingReactionIds.includes(reply.id)}
                    onReact={(kind) => react(reply, kind)}
                    onDelete={() => removeReply(reply)}
                  />
                </li>
              ))}
            </ol>
          ) : null}
          {list.moreFailed ? <Notice tone="error">{MORE_FAILURE_MESSAGE}</Notice> : null}
          {hasMore ? (
            <>
              <p className={styles.meta}>
                {list.replies.length} réponses affichées sur {total}
              </p>
              <button
                type="button"
                className="y-btn y-btn-outline y-btn-sm"
                onClick={loadMore}
                disabled={list.loadingMore}
              >
                {list.loadingMore ? 'Chargement…' : 'Voir plus de réponses'}
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {readOnly ? null : <ReplyComposer questionId={questionId} onPosted={handlePosted} />}
    </section>
  );
}

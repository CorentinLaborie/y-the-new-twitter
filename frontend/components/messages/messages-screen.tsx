'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/avatar/user-avatar';
import { useEffect, useState } from 'react';
import { FeedIcon } from '@/components/feed/feed-icon';
import { fetchConversations, type ConversationView } from '@/lib/messages-api';
import {
  conversationStateLabel,
  formatRowTime,
  listOptionsFor,
  listPreview,
  loadFailureMessage,
  MESSAGES_TABS,
  type MessagesTab,
} from './message-rules';
import styles from './messages.module.css';

/** The name of the list for screen readers, per tab (the boards name each list). */
const LIST_LABELS: Record<MessagesTab, string> = {
  messages: 'Conversations',
  requests: 'Demandes',
  archived: 'Conversations archivées',
  blocked: 'Conversations bloquées',
};

type ReadyList = {
  phase: 'ready';
  conversations: ConversationView[];
  nextCursor: string | null;
  more: 'idle' | 'loading' | 'failed';
};

type ListState = { phase: 'failed'; message: string } | ReadyList;

const SKELETON_ROWS = 5;

/**
 * The list of the viewer's conversations, one tab per list (Messages, Demandes, Archivées), with a search on the loaded
 * ones. Same states as the Notifications page: skeleton lines while loading, the empty state, the error with a retry.
 */
export function MessagesScreen() {
  const [tab, setTab] = useState<MessagesTab>('messages');
  // The number of requests waiting for the viewer, on the « Demandes (N) » tab of the boards.
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    let current = true;
    void fetchConversations({ requests: true, limit: 50 }).then((result) => {
      if (current && result.ok) {
        setRequestCount(result.body.conversations.length);
      }
    });

    return () => {
      current = false;
    };
  }, []);
  const [query, setQuery] = useState('');
  /** The last answer, kept with its tab: a tab with no answer yet shows the loading state. */
  const [answer, setAnswer] = useState<{ tab: MessagesTab; state: ListState } | null>(null);
  /** Changes to ask the first page again (the retry button). */
  const [attempt, setAttempt] = useState(0);
  const state: ListState | null = answer?.tab === tab ? answer.state : null;

  useEffect(() => {
    let active = true;
    fetchConversations(listOptionsFor(tab)).then((result) => {
      if (!active) {
        return;
      }
      const next: ListState = result.ok
        ? {
            phase: 'ready',
            conversations: result.body.conversations,
            nextCursor: result.body.nextCursor,
            more: 'idle',
          }
        : { phase: 'failed', message: loadFailureMessage(result.problem) };
      setAnswer({ tab, state: next });
    });
    return () => {
      active = false;
    };
  }, [tab, attempt]);

  function retry() {
    setAnswer(null);
    setAttempt((count) => count + 1);
  }

  // Going back from a conversation restores this screen without running its loading effect: ask the list again, so an
  // account unblocked in the meantime leaves the Bloqués tab.
  useEffect(() => {
    function reloadOnBack() {
      setAttempt((count) => count + 1);
    }
    window.addEventListener('popstate', reloadOnBack);

    return () => {
      window.removeEventListener('popstate', reloadOnBack);
    };
  }, []);

  async function loadMore(cursor: string) {
    setAnswer((current) =>
      current?.tab === tab && current.state.phase === 'ready'
        ? { tab, state: { ...current.state, more: 'loading' } }
        : current,
    );
    const result = await fetchConversations({ ...listOptionsFor(tab), cursor });
    setAnswer((current) => {
      if (current?.tab !== tab || current.state.phase !== 'ready') {
        return current;
      }
      if (!result.ok) {
        return { tab, state: { ...current.state, more: 'failed' } };
      }
      return {
        tab,
        state: {
          phase: 'ready',
          conversations: [...current.state.conversations, ...result.body.conversations],
          nextCursor: result.body.nextCursor,
          more: 'idle',
        },
      };
    });
  }

  return (
    <section aria-label="Messages privés">
      <div role="tablist" aria-label="Vues des messages" className={styles.tabs}>
        {MESSAGES_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.id === 'requests' && requestCount > 0 ? `${item.label} (${requestCount})` : item.label}
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        <div className={styles.search}>
          <label htmlFor="messages-search" className={styles.visuallyHidden}>
            Rechercher dans les messages
          </label>
          <input
            id="messages-search"
            type="search"
            className={styles.field}
            placeholder="Rechercher"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {state === null ? <MessagesLoading /> : null}
        {state?.phase === 'failed' ? <MessagesError message={state.message} onRetry={retry} /> : null}
        {state?.phase === 'ready' && state.conversations.length === 0 ? <MessagesEmpty tab={tab} /> : null}

        {state?.phase === 'ready' && state.conversations.length > 0 ? (
          <ul aria-label={LIST_LABELS[tab]} className={styles.list}>
            {state.conversations
              .filter((conversation) => matchesQuery(conversation, query))
              .map((conversation) => (
                <ConversationRow key={conversation.id} conversation={conversation} />
              ))}
          </ul>
        ) : null}

        {state?.phase === 'ready' && state.nextCursor !== null ? (
          <button
            type="button"
            className={`y-btn y-btn-outline y-btn-md y-btn-pill ${styles.more}`}
            onClick={() => loadMore(state.nextCursor as string)}
            disabled={state.more === 'loading'}
          >
            {state.more === 'failed' ? 'Réessayer' : 'Voir plus de conversations'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Whether a loaded conversation matches the search: the display name or the handle, without case. */
function matchesQuery(conversation: ConversationView, query: string): boolean {
  const search = query.trim().replace(/^@/, '').toLowerCase();
  if (search === '') {
    return true;
  }
  return (
    conversation.other.displayName.toLowerCase().includes(search) ||
    conversation.other.handle.toLowerCase().includes(search)
  );
}

function ConversationRow({ conversation }: { conversation: ConversationView }) {
  const state = conversationStateLabel(conversation);
  return (
    <li className={conversation.unread ? `${styles.item} ${styles.isUnread}` : styles.item}>
      <Link
        href={`/messages/${conversation.id}`}
        className={styles.row}
        aria-label={`Conversation avec ${conversation.other.displayName}${conversation.unread ? ', non lue' : ''}`}
      >
        <UserAvatar
          className={styles.avatar}
          displayName={conversation.other.displayName}
          avatarUrl={conversation.other.avatarUrl}
        />
        <span className={styles.rowText}>
          <span className={styles.nameLine}>
            <strong>{conversation.other.displayName}</strong>{' '}
            <span className={styles.handle}>@{conversation.other.handle}</span>
            <time className={styles.meta} dateTime={conversation.lastMessageAt}>
              · {formatRowTime(conversation.lastMessageAt)}
            </time>
          </span>
          <span className={styles.previewLine}>
            <span className={styles.preview}>{listPreview(conversation)}</span>
            {state !== '' ? <span className={styles.stateTag}>{state}</span> : null}
          </span>
        </span>
        {conversation.unread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
      </Link>
    </li>
  );
}

/** First load: skeleton lines in a busy region, with a text for screen readers. */
function MessagesLoading() {
  return (
    <div aria-busy="true" className={styles.list}>
      <span className="y-sr">Chargement des messages…</span>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className={styles.skeletonRow} aria-hidden="true">
          <span className="y-skeleton-block y-skeleton-avatar" />
          <div className={styles.skeletonLines}>
            <span className="y-skeleton-block y-skeleton-line is-short" />
            <span className="y-skeleton-block y-skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The list did not load. The retry control is a real button. */
function MessagesError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="y-errorstate" role="alert">
      <span className="y-errorstate-icon">
        <FeedIcon name="triangle-alert" size={24} />
      </span>
      <h2 className="y-errorstate-title">Impossible de charger les messages</h2>
      <p className="y-errorstate-message">{message}</p>
      <button type="button" className="y-errorstate-retry" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}

function MessagesEmpty({ tab }: { tab: MessagesTab }) {
  if (tab === 'requests') {
    return (
      <div className="y-empty">
        <span className="y-empty-icon">
          <FeedIcon name="message-circle" size={28} />
        </span>
        <h2>Aucune demande en attente</h2>
        <p>Les messages de personnes qui ne vous suivent pas apparaîtront ici, à accepter ou à refuser.</p>
      </div>
    );
  }
  if (tab === 'archived') {
    return (
      <div className="y-empty">
        <span className="y-empty-icon">
          <FeedIcon name="message-circle" size={28} />
        </span>
        <h2>Aucune conversation archivée</h2>
        <p>Les conversations que vous archivez apparaîtront ici.</p>
      </div>
    );
  }
  if (tab === 'blocked') {
    return (
      <div className="y-empty">
        <span className="y-empty-icon">
          <FeedIcon name="message-circle" size={28} />
        </span>
        <h2>Aucun compte bloqué</h2>
        <p>
          Les conversations avec les comptes que vous bloquez apparaîtront ici. Vous ne recevez plus leurs
          messages.
        </p>
      </div>
    );
  }
  return (
    <div className="y-empty">
      <span className="y-empty-icon">
        <FeedIcon name="message-circle" size={28} />
      </span>
      <h2>Aucune conversation</h2>
      <p>Écrivez à quelqu’un pour commencer.</p>
      <Link href="/messages/new" className="y-btn y-btn-outline y-btn-md y-btn-pill">
        Nouveau message
      </Link>
    </div>
  );
}

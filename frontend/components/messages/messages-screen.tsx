'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { avatarInitial } from '@/components/feed/avatar-initial';
import { fetchConversations, type ConversationView } from '@/lib/messages-api';
import {
  conversationStateLabel,
  formatMessageTime,
  listOptionsFor,
  loadFailureMessage,
  MESSAGES_TABS,
  type MessagesTab,
} from './message-rules';
import styles from './messages.module.css';

type ReadyList = {
  phase: 'ready';
  conversations: ConversationView[];
  nextCursor: string | null;
  more: 'idle' | 'loading' | 'failed';
};

type ListState = { phase: 'loading' } | { phase: 'failed'; message: string } | ReadyList;

/** The list of the viewer's conversations, one tab per list (Messages, Demandes, Archivées), with a search on the loaded ones. */
export function MessagesScreen() {
  const [tab, setTab] = useState<MessagesTab>('messages');
  const [query, setQuery] = useState('');
  /** The last answer, kept with its tab: a tab with no answer yet shows the loading state. */
  const [answer, setAnswer] = useState<{ tab: MessagesTab; state: ListState } | null>(null);
  const state: ListState = answer?.tab === tab ? answer.state : { phase: 'loading' };

  useEffect(() => {
    let active = true;
    fetchConversations(listOptionsFor(tab)).then((result) => {
      if (!active) {
        return;
      }
      const next: ListState = result.ok
        ? { phase: 'ready', conversations: result.body.conversations, nextCursor: result.body.nextCursor, more: 'idle' }
        : { phase: 'failed', message: loadFailureMessage(result.problem) };
      setAnswer({ tab, state: next });
    });
    return () => {
      active = false;
    };
  }, [tab]);

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
            className={tab === item.id ? `${styles.tab} ${styles.tabCurrent}` : styles.tab}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

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

      {state.phase === 'loading' ? <p role="status">Chargement des messages…</p> : null}
      {state.phase === 'failed' ? <p role="alert">{state.message}</p> : null}
      {state.phase === 'ready' && state.conversations.length === 0 ? <EmptyList tab={tab} /> : null}

      {state.phase === 'ready' && state.conversations.length > 0 ? (
        <ul aria-label="Conversations" className={styles.list}>
          {state.conversations
            .filter((conversation) => matchesQuery(conversation, query))
            .map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
        </ul>
      ) : null}

      {state.phase === 'ready' && state.nextCursor !== null ? (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonOutline}`}
          onClick={() => loadMore(state.nextCursor as string)}
          disabled={state.more === 'loading'}
        >
          {state.more === 'failed' ? 'Réessayer' : 'Voir plus de conversations'}
        </button>
      ) : null}
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
    <li>
      <Link href={`/messages/${conversation.id}`} className={styles.row} aria-label={`Conversation avec ${conversation.other.displayName}`}>
        <span className={styles.avatar} aria-hidden="true">
          {avatarInitial(conversation.other.displayName)}
        </span>
        <span className={styles.rowText}>
          <strong>{conversation.other.displayName}</strong> <span className={styles.handle}>@{conversation.other.handle}</span>
        </span>
        <time className={styles.count} dateTime={conversation.lastMessageAt}>
          {formatMessageTime(conversation.lastMessageAt)}
        </time>
        {state !== '' ? <span className={styles.count}>{state}</span> : null}
        {conversation.unread ? <span aria-label="Non lu" className={styles.unread} /> : null}
      </Link>
    </li>
  );
}

function EmptyList({ tab }: { tab: MessagesTab }) {
  if (tab !== 'messages') {
    return <p className={styles.emptyText}>{tab === 'requests' ? 'Aucune demande en attente.' : 'Aucune conversation archivée.'}</p>;
  }
  return (
    <div className={styles.empty}>
      <h2>Aucune conversation</h2>
      <p>Écrivez à quelqu’un pour commencer.</p>
      <Link href="/messages/new" className={`${styles.button} ${styles.buttonOutline}`}>
        Nouveau message
      </Link>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchConversations, type ConversationView } from '@/lib/messages-api';
import {
  conversationStateLabel,
  formatMessageTime,
  listOptionsFor,
  loadFailureMessage,
  MESSAGES_TABS,
  type MessagesTab,
} from './message-rules';

type ReadyList = {
  phase: 'ready';
  conversations: ConversationView[];
  nextCursor: string | null;
  more: 'idle' | 'loading' | 'failed';
};

type ListState = { phase: 'loading' } | { phase: 'failed'; message: string } | ReadyList;

/** The list of the viewer's conversations, one tab per list (Messages, Demandes, Archivées). */
export function MessagesScreen() {
  const [tab, setTab] = useState<MessagesTab>('messages');
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
      <div role="tablist" aria-label="Vues des messages">
        {MESSAGES_TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <Link href="/messages/new">Nouveau message</Link>

      {state.phase === 'loading' ? <p role="status">Chargement des messages…</p> : null}
      {state.phase === 'failed' ? <p role="alert">{state.message}</p> : null}
      {state.phase === 'ready' && state.conversations.length === 0 ? <EmptyList tab={tab} /> : null}

      {state.phase === 'ready' && state.conversations.length > 0 ? (
        <ul aria-label="Conversations">
          {state.conversations.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} />
          ))}
        </ul>
      ) : null}

      {state.phase === 'ready' && state.nextCursor !== null ? (
        <button type="button" onClick={() => loadMore(state.nextCursor as string)} disabled={state.more === 'loading'}>
          {state.more === 'failed' ? 'Réessayer' : 'Voir plus de conversations'}
        </button>
      ) : null}
    </section>
  );
}

function ConversationRow({ conversation }: { conversation: ConversationView }) {
  const state = conversationStateLabel(conversation);
  return (
    <li>
      <Link href={`/messages/${conversation.id}`} aria-label={`Conversation avec ${conversation.other.displayName}`}>
        <strong>{conversation.other.displayName}</strong> <span>@{conversation.other.handle}</span>{' '}
        <time dateTime={conversation.lastMessageAt}>{formatMessageTime(conversation.lastMessageAt)}</time>
        {state !== '' ? <span>{state}</span> : null}
        {conversation.unread ? <span aria-label="Non lu">•</span> : null}
      </Link>
    </li>
  );
}

function EmptyList({ tab }: { tab: MessagesTab }) {
  const text =
    tab === 'requests'
      ? 'Aucune demande en attente.'
      : tab === 'archived'
        ? 'Aucune conversation archivée.'
        : 'Aucune conversation pour le moment.';
  return <p>{text}</p>;
}

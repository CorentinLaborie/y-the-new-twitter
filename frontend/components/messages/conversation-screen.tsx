'use client';

import Link from 'next/link';
import { avatarInitial } from '@/components/feed/avatar-initial';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { BlockDialog } from '@/components/block/block-dialog';
import {
  acceptRequest,
  archiveConversation,
  declineRequest,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  muteConversation,
  sendMessage,
  unarchiveConversation,
  unmuteConversation,
  type ConversationView,
  type MessageView,
} from '@/lib/messages-api';
import {
  canWrite,
  composerNotice,
  formatMessageTime,
  loadFailureMessage,
  MESSAGE_MAX_LENGTH,
  sendFailureMessage,
} from './message-rules';
import styles from './messages.module.css';

type ReadyThread = {
  phase: 'ready';
  conversation: ConversationView;
  /** Newest first, as the API lists them. The screen shows them oldest first. */
  messages: MessageView[];
  nextCursor: string | null;
  more: 'idle' | 'loading' | 'failed';
  actionError: string | null;
};

type ThreadState = { phase: 'loading' } | { phase: 'failed'; message: string } | ReadyThread;

/** One conversation: its messages, the answer to a request, the composer, and the menu (mute, archive, block). */
export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ThreadState>({ phase: 'loading' });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchConversation(conversationId), fetchMessages(conversationId)]).then(
      ([conversation, page]) => {
        if (!active) {
          return;
        }
        if (!conversation.ok) {
          setState({ phase: 'failed', message: loadFailureMessage(conversation.problem) });
          return;
        }
        if (!page.ok) {
          setState({ phase: 'failed', message: loadFailureMessage(page.problem) });
          return;
        }
        setState({
          phase: 'ready',
          conversation: conversation.body,
          messages: page.body.messages,
          nextCursor: page.body.nextCursor,
          more: 'idle',
          actionError: null,
        });
        void markConversationRead(conversationId);
      },
    );
    return () => {
      active = false;
    };
  }, [conversationId]);

  if (state.phase === 'loading') {
    return <p role="status">Chargement de la conversation…</p>;
  }
  if (state.phase === 'failed') {
    return (
      <p role="alert">
        {state.message} <Link href="/messages">Retour aux messages</Link>
      </p>
    );
  }

  const { conversation, messages, nextCursor, more, actionError } = state;
  const viewerHasWritten = messages.some((message) => message.mine);
  const writable = canWrite(conversation, viewerHasWritten);
  const notice = composerNotice(conversation, viewerHasWritten);
  const waitingForAnswer = conversation.status === 'pending' && !conversation.initiatedByViewer;

  function patch(update: Partial<Pick<ReadyThread, 'more' | 'actionError'>>) {
    setState((current) => (current.phase === 'ready' ? { ...current, ...update } : current));
  }

  function patchConversation(update: Partial<ConversationView>) {
    setState((current) =>
      current.phase === 'ready'
        ? { ...current, conversation: { ...current.conversation, ...update } }
        : current,
    );
  }

  async function answer(accept: boolean) {
    patch({ actionError: null });
    const result = accept ? await acceptRequest(conversationId) : await declineRequest(conversationId);
    if (result.ok) {
      patchConversation({ status: accept ? 'accepted' : 'declined' });
      return;
    }
    patch({ actionError: 'La demande n’a pas pu être traitée. Actualisez la page.' });
  }

  async function toggleMute() {
    const result = conversation.muted
      ? await unmuteConversation(conversationId)
      : await muteConversation(conversationId);
    if (result.ok) {
      patchConversation({ muted: !conversation.muted });
    }
    setMenuOpen(false);
  }

  async function toggleArchive() {
    const result = conversation.archived
      ? await unarchiveConversation(conversationId)
      : await archiveConversation(conversationId);
    if (result.ok) {
      patchConversation({ archived: !conversation.archived });
    }
    setMenuOpen(false);
  }

  async function loadOlder() {
    if (nextCursor === null) {
      return;
    }
    patch({ more: 'loading' });
    const page = await fetchMessages(conversationId, { cursor: nextCursor });
    setState((current) => {
      if (current.phase !== 'ready') {
        return current;
      }
      if (!page.ok) {
        return { ...current, more: 'failed' };
      }
      return {
        ...current,
        messages: [...current.messages, ...page.body.messages],
        nextCursor: page.body.nextCursor,
        more: 'idle',
      };
    });
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text === '' || sending || !writable) {
      return;
    }
    setSending(true);
    patch({ actionError: null });
    const result = await sendMessage(conversationId, text);
    setSending(false);
    if (result.ok) {
      setDraft('');
      setState((current) =>
        current.phase === 'ready'
          ? {
              ...current,
              messages: [result.body, ...current.messages],
              conversation: { ...current.conversation, lastMessageAt: result.body.createdAt },
            }
          : current,
      );
      return;
    }
    patch({ actionError: sendFailureMessage(result.problem) });
  }

  return (
    <section aria-label={`Conversation avec ${conversation.other.displayName}`}>
      <header className={styles.threadHeader}>
        <span className={styles.threadAvatar} aria-hidden="true">
          {avatarInitial(conversation.other.displayName)}
        </span>
        <div className={styles.threadName}>
          <h2>{conversation.other.displayName}</h2>
          <p>@{conversation.other.handle}</p>
        </div>
        <Link
          href={`/u/${encodeURIComponent(conversation.other.handle)}`}
          className={`${styles.button} ${styles.buttonOutline}`}
        >
          Voir le profil
        </Link>
        <button
          className={`${styles.button} ${styles.buttonOutline}`}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Options de la conversation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋯
        </button>
        {menuOpen ? (
          <ul className={styles.menu} role="menu" aria-label="Options de la conversation">
            <li role="none">
              <Link href={`/u/${conversation.other.handle}`} role="menuitem" className={styles.menuItem}>
                Voir le profil
              </Link>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className={styles.menuItem} onClick={toggleMute}>
                {conversation.muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className={styles.menuItem} onClick={toggleArchive}>
                {conversation.archived ? 'Désarchiver' : 'Archiver'}
              </button>
            </li>
            <li role="none">
              <button
                className={styles.menuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setBlockOpen(true);
                }}
              >
                Bloquer
              </button>
            </li>
          </ul>
        ) : null}
      </header>

      {more === 'failed' ? <p role="alert">Les messages précédents n’ont pas pu être chargés.</p> : null}
      {nextCursor !== null ? (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonOutline}`}
          onClick={loadOlder}
          disabled={more === 'loading'}
        >
          Voir les messages précédents
        </button>
      ) : null}

      <ol aria-label="Messages">
        {[...messages].reverse().map((message) => (
          <li key={message.id} data-mine={message.mine ? 'true' : 'false'}>
            <p>{message.text}</p>
            <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
          </li>
        ))}
      </ol>

      {waitingForAnswer ? (
        <div role="group" aria-label="Répondre à la demande">
          <button type="button" className={styles.button} onClick={() => answer(true)}>
            Accepter
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonOutline}`}
            onClick={() => answer(false)}
          >
            Refuser
          </button>
        </div>
      ) : null}

      {notice !== null ? <p>{notice}</p> : null}
      {actionError !== null ? <p role="alert">{actionError}</p> : null}

      <form onSubmit={send} aria-label="Écrire un message">
        <label htmlFor="message-draft">Écrire un message à {conversation.other.displayName}</label>
        <textarea
          className={styles.field}
          id="message-draft"
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!writable || sending}
          rows={2}
        />
        <p aria-live="polite">
          {draft.length} / {MESSAGE_MAX_LENGTH}
        </p>
        <button
          type="submit"
          className={styles.button}
          disabled={!writable || sending || draft.trim() === ''}
        >
          Envoyer
        </button>
      </form>

      <BlockDialog
        open={blockOpen}
        handle={conversation.other.handle}
        onClose={() => setBlockOpen(false)}
        onBlocked={() => router.push('/messages')}
      />
    </section>
  );
}

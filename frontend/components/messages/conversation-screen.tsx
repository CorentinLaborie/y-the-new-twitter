'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/avatar/user-avatar';
import { fetchProfile, type ProfileView } from '@/lib/profile-api';
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
  threadItems,
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
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchConversation(conversationId), fetchMessages(conversationId)]).then(
      ([conversation, page]) => {
        if (!active) {
          return;
        }
        if (!conversation.ok && conversation.problem.status === 404) {
          router.replace('/messages');
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
  }, [conversationId, router]);

  const otherHandle = state.phase === 'ready' ? state.conversation.other.handle : null;
  useEffect(() => {
    if (otherHandle === null) {
      return;
    }
    let current = true;
    void fetchProfile(otherHandle).then((result) => {
      if (current) {
        setProfile(result.ok ? result.body : null);
      }
    });

    return () => {
      current = false;
    };
  }, [otherHandle]);

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
        <UserAvatar
          className={styles.threadAvatar}
          displayName={conversation.other.displayName}
          avatarUrl={conversation.other.avatarUrl}
        />
        <div className={styles.threadName}>
          <h2>{conversation.other.displayName}</h2>
          <p>
            @{conversation.other.handle}
            {conversation.archived ? ' · Archivée' : ''}
          </p>
        </div>
        <Link href={`/u/${encodeURIComponent(conversation.other.handle)}`} className={styles.profileButton}>
          Voir le profil
        </Link>
        <button
          className={styles.menuButton}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Options de la conversation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="19" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
        {menuOpen ? (
          <ul className={styles.menu} role="menu" aria-label="Options de la conversation">
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

      {profile !== null ? (
        <section aria-label="Profil" className={styles.profileCard}>
          <h3>{profile.displayName}</h3>
          <p className={styles.profileHandle}>@{profile.handle}</p>
          {profile.bio ? <p className={styles.profileBio}>{profile.bio}</p> : null}
          <p className={styles.profileMeta}>
            A rejoint Y en{' '}
            {new Date(profile.joinedAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} ·{' '}
            <strong>{profile.followerCount.toLocaleString('fr-FR')}</strong> abonnés
          </p>
        </section>
      ) : null}
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

      <ul aria-label="Messages" className={styles.thread}>
        {threadItems(
          [...messages].reverse(),
          conversation.other.displayName,
          conversation.otherLastReadAt,
        ).map((item) =>
          item.kind === 'day' ? (
            <li key={item.key} className={styles.dayDivider} role="none">
              <span>{item.label}</span>
            </li>
          ) : (
            <li
              key={item.key}
              className={item.mine ? styles.rowMine : styles.rowOther}
              data-mine={item.mine ? 'true' : 'false'}
            >
              <p className={item.mine ? styles.bubbleMine : styles.bubbleOther}>{item.text}</p>
              {item.meta !== null ? <time className={styles.meta}>{item.meta}</time> : null}
            </li>
          ),
        )}
      </ul>

      {waitingForAnswer ? (
        <div
          role="group"
          aria-label={`Demande de ${conversation.other.displayName}`}
          className={styles.requestActions}
        >
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

      <form onSubmit={send} aria-label="Écrire un message" className={styles.composer}>
        <label htmlFor="message-draft" className={styles.visuallyHidden}>
          Écrire un message à {conversation.other.displayName}
        </label>
        <textarea
          className={styles.composerField}
          placeholder="Écrire un message"
          id="message-draft"
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!writable || sending}
          rows={2}
        />
        <div className={styles.composerFooter}>
          <p aria-live="polite" className={styles.counter}>
            {draft.length} / {MESSAGE_MAX_LENGTH}
          </p>
          <button
            type="submit"
            className={styles.sendButton}
            aria-label="Envoyer"
            disabled={!writable || sending || draft.trim() === ''}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11l18-8-8 18-2-8-8-2z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </form>

      <BlockDialog
        open={blockOpen}
        handle={conversation.other.handle}
        onClose={() => setBlockOpen(false)}
        onBlocked={() => router.replace('/messages')}
      />
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { avatarInitial } from '@/components/feed/avatar-initial';
import { fetchMentionSuggestions, type MentionSuggestion } from '@/lib/mention-api';
import { startConversation } from '@/lib/messages-api';
import { MESSAGE_MAX_LENGTH, sendFailureMessage } from './message-rules';
import styles from './messages.module.css';

const SUGGESTION_DELAY_MS = 200;
const LIST_ID = 'new-message-suggestions';

/** The texts for the refusals of a new conversation (the handle is looked up by the API). */
function newMessageFailureMessage(status: number, fallback: string): string {
  if (status === 404) {
    return 'Ce compte est introuvable.';
  }
  if (status === 422) {
    return 'Vous ne pouvez pas vous écrire à vous-même.';
  }
  return fallback;
}

/**
 * The new message page of the Messages-New boards (07 · Messages). The left column holds the search for the recipient
 * and the list of people it finds: it follows the text typed, like the mention picker (arrows, Entrée, Échap). The right
 * column holds the message. A request is opened when the recipient does not follow the viewer.
 */
export function NewMessageScreen() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const listShown = listOpen && suggestions.length > 0;
  const recipient = handle.trim().replace(/^@/, '');

  // The accounts the viewer follows or that follow the viewer, for the text typed so far (the same list as the mentions).
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void fetchMentionSuggestions(recipient).then((result) => {
        if (current) {
          setSuggestions(result.ok ? result.body.items : []);
          setActiveIndex(0);
        }
      });
    }, SUGGESTION_DELAY_MS);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [recipient]);

  function pick(account: string) {
    setHandle(account);
    setListOpen(false);
    setActiveIndex(0);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!listShown) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      const chosen = suggestions[activeIndex];
      if (chosen !== undefined) {
        event.preventDefault();
        pick(chosen.handle);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setListOpen(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanText = text.trim();
    if (recipient === '' || cleanText === '' || sending) {
      return;
    }
    setSending(true);
    setFailure(null);
    const result = await startConversation(recipient, cleanText);
    setSending(false);
    if (result.ok) {
      router.push(`/messages/${result.body.conversationId}`);
      return;
    }
    setFailure(newMessageFailureMessage(result.problem.status, sendFailureMessage(result.problem)));
  }

  return (
    <section aria-label="Nouveau message" className={styles.newMessage}>
      <section aria-label="Destinataires" className={styles.recipientsColumn}>
        <header className={styles.newHeader}>
          <Link href="/messages" className={`y-btn y-btn-ghost y-btn-sm ${styles.backButton}`}>
            <span aria-hidden="true">←</span> Retour aux messages
          </Link>
          <h1 className={styles.title}>Nouveau message</h1>
        </header>
        <div className={styles.searchRow}>
          <label htmlFor="new-message-handle" className={styles.visuallyHidden}>
            Rechercher une personne
          </label>
          <input
            id="new-message-handle"
            className={styles.field}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listShown}
            aria-controls={LIST_ID}
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value);
              setListOpen(true);
            }}
            onKeyDown={onHandleKeyDown}
            placeholder="Nom ou @pseudo"
            maxLength={30}
            autoComplete="off"
          />
        </div>
        <h2 className={styles.sectionLabel}>Suggestions</h2>
        {listShown ? (
          <ul id={LIST_ID} role="listbox" aria-label="Personnes suggérées" className={styles.suggestionList}>
            {suggestions.map((account, index) => (
              <li key={account.handle}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={styles.suggestionRow}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(account.handle)}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {avatarInitial(account.displayName)}
                  </span>
                  <span className={styles.rowText}>
                    <strong>{account.displayName}</strong>
                    <span className={styles.handle}>@{account.handle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="Rédiger un message" className={styles.composeColumn}>
        <form className={styles.newForm} onSubmit={submit}>
          <p className={styles.recipientLine}>
            Destinataire :{' '}
            <strong>{recipient === '' ? 'aucun destinataire sélectionné' : `@${recipient}`}</strong>
          </p>
          <label htmlFor="new-message-text" className={styles.label}>
            Message
          </label>
          <textarea
            className={styles.field}
            id="new-message-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Écrivez votre message"
            maxLength={MESSAGE_MAX_LENGTH}
            rows={6}
          />
          <p aria-live="polite" className={styles.counter}>
            {text.length} / {MESSAGE_MAX_LENGTH}
          </p>
          <p className={styles.hint}>
            Si cette personne ne vous suit pas, votre message devient une demande.
          </p>
          {failure !== null ? <p role="alert">{failure}</p> : null}
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.button}
              disabled={sending || recipient === '' || text.trim() === ''}
            >
              Envoyer
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

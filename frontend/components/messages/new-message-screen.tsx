'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { fetchMentionSuggestions, type MentionSuggestion } from '@/lib/mention-api';
import { startConversation } from '@/lib/messages-api';
import { MESSAGE_MAX_LENGTH, sendFailureMessage } from './message-rules';
import styles from './messages.module.css';

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

const SUGGESTION_DELAY_MS = 200;

/** Starts a conversation with a handle. A request is opened when that account does not follow the viewer. */
export function NewMessageScreen() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // The accounts the viewer follows or that follow the viewer, for the handle typed so far (the same list as the mentions).
  useEffect(() => {
    let current = true;
    const query = handle.trim().replace(/^@/, '');
    const timer = window.setTimeout(() => {
      void fetchMentionSuggestions(query).then((result) => {
        if (current) {
          setSuggestions(result.ok ? result.body.items : []);
        }
      });
    }, SUGGESTION_DELAY_MS);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [handle]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanHandle = handle.trim().replace(/^@/, '');
    const cleanText = text.trim();
    if (cleanHandle === '' || cleanText === '' || sending) {
      return;
    }
    setSending(true);
    setFailure(null);
    const result = await startConversation(cleanHandle, cleanText);
    setSending(false);
    if (result.ok) {
      router.push(`/messages/${result.body.conversationId}`);
      return;
    }
    setFailure(
      newMessageFailureMessage(result.problem.status, sendFailureMessage(result.problem)),
    );
  }

  return (
    <section aria-label="Nouveau message">
      <Link href="/messages">Retour aux messages</Link>
      <form onSubmit={submit}>
        <label htmlFor="new-message-handle">Destinataire</label>
        <input
          className={styles.field}
          id="new-message-handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="Pseudo, par exemple alice"
          maxLength={30}
          autoComplete="off"
        />
        {suggestions.length > 0 ? (
          <ul aria-label="Suggestions" className={styles.suggestions}>
            {suggestions.map((account) => (
              <li key={account.handle}>
                <button type="button" className={styles.suggestion} onClick={() => setHandle(account.handle)}>
                  {account.displayName} <span className={styles.handle}>@{account.handle}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label htmlFor="new-message-text">Message</label>
        <textarea
          className={styles.field}
          id="new-message-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MESSAGE_MAX_LENGTH}
          rows={4}
        />
        <p aria-live="polite">
          {text.length} / {MESSAGE_MAX_LENGTH}
        </p>
        <p>Si cette personne ne vous suit pas, votre message devient une demande.</p>
        {failure !== null ? <p role="alert">{failure}</p> : null}
        <button type="submit" className={styles.button} disabled={sending || handle.trim() === '' || text.trim() === ''}>
          Envoyer
        </button>
      </form>
    </section>
  );
}

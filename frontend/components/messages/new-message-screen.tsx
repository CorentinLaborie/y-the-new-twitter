'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MentionPicker } from '@/components/conversation/mention-picker';
import { fetchMentionSuggestions, type MentionSuggestion } from '@/lib/mention-api';
import { startConversation } from '@/lib/messages-api';
import { MESSAGE_MAX_LENGTH, sendFailureMessage } from './message-rules';
import styles from './messages.module.css';

const SUGGESTION_DELAY_MS = 200;
const PICKER_ID = 'new-message-suggestions';

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
 * Starts a conversation with a handle. The recipient field proposes the accounts linked to the viewer, with the same
 * picker and keyboard as the mentions (arrows, Entrée, Échap). A request is opened when that account does not follow
 * the viewer.
 */
export function NewMessageScreen() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);
  const pickerShown = pickerOpen && suggestions.length > 0;

  // The accounts the viewer follows or that follow the viewer, for the handle typed so far (the same list as the mentions).
  useEffect(() => {
    let current = true;
    const query = handle.trim().replace(/^@/, '');
    const timer = window.setTimeout(() => {
      void fetchMentionSuggestions(query).then((result) => {
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
  }, [handle]);

  function pick(account: string) {
    setHandle(account);
    setPickerOpen(false);
    setActiveIndex(0);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!pickerShown) {
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
      setPickerOpen(false);
    }
  }

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
    setFailure(newMessageFailureMessage(result.problem.status, sendFailureMessage(result.problem)));
  }

  return (
    <section aria-label="Nouveau message">
      <Link href="/messages" className={styles.backLink}>
        Retour aux messages
      </Link>
      <form className={styles.newForm} onSubmit={submit}>
        <div role="group" aria-label="Destinataires" className={styles.recipients}>
          <label htmlFor="new-message-handle" className={styles.label}>
            Destinataire
          </label>
          <input
            className={styles.field}
            id="new-message-handle"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={pickerShown}
            aria-controls={PICKER_ID}
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value);
              setPickerOpen(true);
            }}
            onKeyDown={onHandleKeyDown}
            placeholder="Pseudo, par exemple alice"
            maxLength={30}
            autoComplete="off"
          />
          <p className={styles.hint}>
            Destinataire :{' '}
            {handle.trim() === '' ? 'aucun destinataire sélectionné' : `@${handle.trim().replace(/^@/, '')}`}
          </p>
          {pickerShown ? (
            <>
              <h2 className={styles.label}>Suggestions</h2>
              <MentionPicker
                id={PICKER_ID}
                label="Personnes suggérées"
                suggestions={suggestions}
                activeIndex={activeIndex}
                onPick={pick}
              />
            </>
          ) : null}
        </div>
        <div role="group" aria-label="Rédiger un message" className={styles.recipients}>
          <label htmlFor="new-message-text" className={styles.label}>
            Message
          </label>
          <textarea
            className={styles.field}
            id="new-message-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={4}
          />
        </div>
        <p aria-live="polite" className={styles.hint}>
          {text.length} / {MESSAGE_MAX_LENGTH}
        </p>
        <p className={styles.hint}>Si cette personne ne vous suit pas, votre message devient une demande.</p>
        {failure !== null ? <p role="alert">{failure}</p> : null}
        <button
          type="submit"
          className={styles.button}
          disabled={sending || handle.trim() === '' || text.trim() === ''}
        >
          Envoyer
        </button>
      </form>
    </section>
  );
}

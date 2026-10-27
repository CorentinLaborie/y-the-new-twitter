'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { startConversation } from '@/lib/messages-api';
import { MESSAGE_MAX_LENGTH, sendFailureMessage } from './message-rules';

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

/** Starts a conversation with a handle. A request is opened when that account does not follow the viewer. */
export function NewMessageScreen() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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
          id="new-message-handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="Pseudo, par exemple alice"
          maxLength={30}
          autoComplete="off"
        />
        <label htmlFor="new-message-text">Message</label>
        <textarea
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
        <button type="submit" disabled={sending || handle.trim() === '' || text.trim() === ''}>
          Envoyer
        </button>
      </form>
    </section>
  );
}

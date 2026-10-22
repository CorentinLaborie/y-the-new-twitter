'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Notice } from '@/components/auth/notice';
import { FeedIcon } from '@/components/feed/feed-icon';
import styles from '@/components/feed/feed.module.css';
import { messageForCode } from '@/lib/api-messages';
import type { ApiProblem } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency';
import {
  createReply,
  isReplyTextValid,
  REPLY_MAX_LENGTH,
  replyCharacterCount,
  type ReplyView,
} from '@/lib/replies-api';

type ReplyComposerProps = {
  questionId: string;
  /** Called with the reply the API created, so that the conversation shows it at the end of the list. */
  onPosted: (reply: ReplyView) => void;
};

const POST_FAILURE_MESSAGE = 'Votre réponse n’a pas été publiée. Vérifiez votre connexion, puis réessayez.';

function postFailureMessage(problem: ApiProblem): string {
  return messageForCode(problem) ?? POST_FAILURE_MESSAGE;
}

/**
 * Composer of a reply under an open question (Reply-Composer boards). Text only, 1 to 280 characters, counted in code
 * points. Over the limit the text is refused with a message and the button stays off. A failed post keeps the text
 * and shows an inline alert with a retry; the Idempotency-Key is kept while the text does not change, so a retry
 * cannot post the reply twice.
 */
export function ReplyComposer({ questionId, onPosted }: ReplyComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // One key per text: a repeated send of the same text returns the first reply (Idempotency-Key).
  const idempotencyKey = useRef<string | null>(null);
  const textareaId = useId();
  const counterId = useId();
  const refusalId = useId();

  const characterCount = replyCharacterCount(text);
  const tooLong = characterCount > REPLY_MAX_LENGTH;
  const excess = characterCount - REPLY_MAX_LENGTH;
  const canSend = isReplyTextValid(text) && !sending;

  function handleChange(value: string) {
    setText(value);
    idempotencyKey.current = null;
    setSendError(null);
  }

  async function send() {
    if (!canSend) {
      return;
    }
    const body = text.trim();
    idempotencyKey.current ??= newIdempotencyKey();
    setSending(true);
    setSendError(null);
    const result = await createReply(questionId, body, idempotencyKey.current);
    setSending(false);
    if (result.ok) {
      idempotencyKey.current = null;
      setText('');
      onPosted(result.body);
    } else {
      setSendError(postFailureMessage(result.problem));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <form className={styles.composerBody} onSubmit={handleSubmit}>
      <label htmlFor={textareaId} className={styles.composerLabel}>
        Votre réponse
      </label>
      <textarea
        id={textareaId}
        className={styles.textarea}
        placeholder="Écrivez votre réponse…"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        aria-invalid={tooLong ? true : undefined}
        aria-describedby={tooLong ? `${counterId} ${refusalId}` : counterId}
        disabled={sending}
      />
      {tooLong ? (
        <p id={refusalId} className={styles.refusal}>
          Votre réponse dépasse la limite de {REPLY_MAX_LENGTH} caractères. Retirez {excess}{' '}
          {excess === 1 ? 'caractère' : 'caractères'} pour publier.
        </p>
      ) : null}
      {sendError ? (
        <Notice tone="error">
          <span>{sendError} </span>
          <button
            type="button"
            className="y-btn y-btn-outline y-btn-sm"
            onClick={() => void send()}
            disabled={sending}
          >
            Réessayer
          </button>
        </Notice>
      ) : null}
      <div className={styles.composerFooter}>
        <span className={styles.hint}>
          <FeedIcon name="globe" size={16} />
          <span>Réponse publique</span>
        </span>
        <div className={styles.composerActions}>
          <span id={counterId} className={styles.counter} data-over={tooLong ? 'true' : undefined}>
            {characterCount}/{REPLY_MAX_LENGTH}
          </span>
          <button type="submit" className={`y-btn y-btn-primary ${styles.submit}`} disabled={!canSend}>
            {sending ? 'Envoi…' : 'Répondre'}
          </button>
        </div>
      </div>
    </form>
  );
}

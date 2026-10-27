'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Notice } from '@/components/auth/notice';
import { FeedIcon } from '@/components/feed/feed-icon';
import styles from '@/components/feed/feed.module.css';
import type { ApiProblem } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import { fetchMentionSuggestions, type MentionSuggestion } from '@/lib/mention-api';
import { insertMention, mentionQueryAt, type MentionQuery } from '@/lib/mention-picker';
import { newIdempotencyKey } from '@/lib/idempotency';
import {
  createReply,
  isReplyTextValid,
  REPLY_MAX_LENGTH,
  replyCharacterCount,
  type ReplyView,
} from '@/lib/replies-api';
import { MentionPicker } from './mention-picker';

/** The selector open under the textarea: the mention being typed, the accounts proposed and the row the keyboard is on. */
type PickerState = { mention: MentionQuery; suggestions: MentionSuggestion[]; activeIndex: number };

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
 * cannot post the reply twice. Typing '@' and a handle opens the mention selector (section M3): the arrows move, Entrée
 * picks, Échap closes it, and a click picks too.
 */
export function ReplyComposer({ questionId, onPosted }: ReplyComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  // One key per text: a repeated send of the same text returns the first reply (Idempotency-Key).
  const idempotencyKey = useRef<string | null>(null);
  // Each suggestion request gets a number: an answer that is no longer the latest one is dropped.
  const suggestionRequest = useRef(0);
  // The caret to put back in the textarea once a picked mention has been written.
  const caretAfterPick = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaId = useId();
  const counterId = useId();
  const refusalId = useId();
  const pickerId = useId();

  const characterCount = replyCharacterCount(text);
  const tooLong = characterCount > REPLY_MAX_LENGTH;
  const excess = characterCount - REPLY_MAX_LENGTH;
  const canSend = isReplyTextValid(text) && !sending;

  useEffect(() => {
    if (caretAfterPick.current !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(caretAfterPick.current, caretAfterPick.current);
      caretAfterPick.current = null;
    }
  });

  function applyText(value: string) {
    setText(value);
    idempotencyKey.current = null;
    setSendError(null);
  }

  function closePicker() {
    suggestionRequest.current += 1;
    setPicker(null);
  }

  async function openPicker(mention: MentionQuery | null) {
    const request = (suggestionRequest.current += 1);
    if (mention === null) {
      setPicker(null);
      return;
    }
    const result = await fetchMentionSuggestions(mention.query);
    if (request !== suggestionRequest.current) {
      return;
    }
    if (!result.ok || result.body.items.length === 0) {
      setPicker(null);
      return;
    }
    setPicker({ mention, suggestions: result.body.items, activeIndex: 0 });
  }

  function handleChange(value: string, caret: number) {
    applyText(value);
    void openPicker(mentionQueryAt(value, caret));
  }

  function pickHandle(handle: string) {
    if (picker === null) {
      return;
    }
    const inserted = insertMention(text, picker.mention, handle);
    closePicker();
    applyText(inserted.text);
    caretAfterPick.current = inserted.caret;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (picker === null) {
      return;
    }
    const count = picker.suggestions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setPicker({ ...picker, activeIndex: (picker.activeIndex + step + count) % count });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const active = picker.suggestions[picker.activeIndex];
      if (active) {
        pickHandle(active.handle);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePicker();
    }
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
      closePicker();
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
        ref={textareaRef}
        id={textareaId}
        className={styles.textarea}
        placeholder="Écrivez votre réponse…"
        value={text}
        onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={picker !== null ? pickerId : undefined}
        aria-invalid={tooLong ? true : undefined}
        aria-describedby={tooLong ? `${counterId} ${refusalId}` : counterId}
        disabled={sending}
      />
      {picker !== null ? (
        <MentionPicker
          id={pickerId}
          suggestions={picker.suggestions}
          activeIndex={picker.activeIndex}
          onPick={pickHandle}
        />
      ) : null}
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

'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Notice } from '@/components/auth/notice';
import { MentionPicker } from '@/components/conversation/mention-picker';
import { useMentionPicker } from '@/components/conversation/use-mention-picker';
import { messageForCode, messageForStatus } from '@/lib/api-messages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { postQuestion, type FeedQuestion } from '@/lib/feed-api';
import { avatarInitial } from './avatar-initial';
import { FeedIcon } from './feed-icon';
import styles from './feed.module.css';
import {
  checkQuestion,
  normalizeQuestion,
  QUESTION_MAX_LENGTH,
  questionLength,
  TOO_LONG_MESSAGE,
} from './question-rules';

type ComposerProps = {
  /** Display name of the signed-in user, for the avatar. */
  displayName: string;
  /** True for a suspended account: publishing is off (R13, DEC-095), and the composer says why. */
  suspended: boolean;
  /** Called with the question the API created, so that the feed shows it first. */
  onPosted: (question: FeedQuestion) => void;
};

/** Shown under the composer when the account is suspended (section 3.4, DEC-095). */
const SUSPENDED_PUBLISHING_MESSAGE = 'Votre compte est suspendu : la publication est désactivée.';

/**
 * Composer of a question at the top of the feed (Home boards). Text only, up to 280 characters (R1).
 * Over the limit the text is refused with a message, and the button stays off. The API refusal is shown as a notice.
 * A suspended account gets the button off, with the reason of it under the composer.
 */
export function Composer({ displayName, suspended, onPosted }: ComposerProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One key per text: a repeated submit of the same text returns the first result (Idempotency-Key).
  const idempotencyKey = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentions = useMentionPicker(textareaRef);
  const textareaId = useId();
  const hintId = useId();
  const refusalId = useId();
  const suspendedId = useId();

  const characterCount = questionLength(text);
  const questionCheck = checkQuestion(text);
  const tooLong = !questionCheck.ok && questionCheck.reason === 'too-long';
  const canSubmit = questionCheck.ok && !submitting && !suspended;

  function applyText(value: string) {
    setText(value);
    idempotencyKey.current = null;
    setSubmitError(null);
  }

  function handleChange(value: string, caret: number) {
    applyText(value);
    mentions.onTextChange(value, caret);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    idempotencyKey.current ??= newIdempotencyKey();
    setSubmitting(true);
    setSubmitError(null);
    const result = await postQuestion(normalizeQuestion(text), idempotencyKey.current);
    setSubmitting(false);
    if (result.ok) {
      idempotencyKey.current = null;
      mentions.close();
      setText('');
      onPosted(result.body);
    } else {
      setSubmitError(messageForCode(result.problem) ?? messageForStatus(result.problem));
    }
  }

  const describedBy = tooLong ? `${hintId} ${refusalId}` : hintId;

  return (
    <form id="composer" className={styles.composer} onSubmit={handleSubmit}>
      <span className={`${styles.avatar} ${styles.composerAvatar}`} aria-hidden="true">
        {avatarInitial(displayName)}
      </span>
      <div className={styles.composerBody}>
        <label htmlFor={textareaId} className={styles.composerLabel}>
          Posez votre question
        </label>
        <textarea
          ref={textareaRef}
          id={textareaId}
          className={styles.textarea}
          placeholder={'Quelle est votre question ?'}
          value={text}
          onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onKeyDown={(event) => {
            const picked = mentions.handleKeyDown(event, text);
            if (picked !== null) {
              applyText(picked);
            }
          }}
          aria-autocomplete="list"
          aria-controls={mentions.picker !== null ? mentions.pickerId : undefined}
          aria-invalid={tooLong ? true : undefined}
          aria-describedby={describedBy}
          disabled={submitting}
        />
        {mentions.picker !== null ? (
          <MentionPicker
            id={mentions.pickerId}
            suggestions={mentions.picker.suggestions}
            activeIndex={mentions.picker.activeIndex}
            onPick={(handle) => applyText(mentions.pick(text, handle))}
          />
        ) : null}
        {tooLong ? (
          <p id={refusalId} className={styles.refusal}>
            {TOO_LONG_MESSAGE}
          </p>
        ) : null}
        {suspended ? (
          <p id={suspendedId} className={styles.refusal}>
            {SUSPENDED_PUBLISHING_MESSAGE}
          </p>
        ) : null}
        {submitError ? <Notice tone="error">{submitError}</Notice> : null}
        <div className={styles.composerFooter}>
          <span id={hintId} className={styles.hint}>
            <FeedIcon name="globe" size={16} />
            <span>Tout le monde peut répondre</span>
          </span>
          <div className={styles.composerActions}>
            <span className={styles.counter} data-over={tooLong ? 'true' : undefined}>
              {characterCount}/{QUESTION_MAX_LENGTH}
            </span>
            <button
              type="submit"
              className={`y-btn y-btn-primary ${styles.submit}`}
              disabled={!canSubmit}
              aria-describedby={suspended ? suspendedId : undefined}
            >
              {submitting ? 'Publication…' : 'Poster'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

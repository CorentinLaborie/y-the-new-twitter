'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Notice } from '@/components/auth/notice';
import { postQuestion, type FeedQuestion } from '@/lib/feed-api';
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
  /** Called with the question the API created, so that the feed shows it first. */
  onPosted: (question: FeedQuestion) => void;
};

/**
 * Composer of a question at the top of the feed (Home boards). Text only, up to 280 characters (R1).
 * Over the limit the text is refused with a message, and the button stays off. The API refusal is shown as a notice.
 */
export function Composer({ displayName, onPosted }: ComposerProps) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // One key per text: a repeated submit of the same text returns the first result (Idempotency-Key).
  const idempotencyKey = useRef<string | null>(null);
  const textareaId = useId();
  const hintId = useId();
  const refusalId = useId();

  const length = questionLength(text);
  const check = checkQuestion(text);
  const tooLong = !check.ok && check.reason === 'too-long';
  const canSubmit = check.ok && !pending;

  function handleChange(value: string) {
    setText(value);
    idempotencyKey.current = null;
    setFailure(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFailure(null);
    const result = await postQuestion(normalizeQuestion(text), idempotencyKey.current);
    setPending(false);
    if (result.ok) {
      idempotencyKey.current = null;
      setText('');
      onPosted(result.body);
    } else {
      setFailure(result.problem.detail);
    }
  }

  const describedBy = tooLong ? `${hintId} ${refusalId}` : hintId;

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <span className={`${styles.avatar} ${styles.composerAvatar}`} aria-hidden="true">
        {displayName.charAt(0).toUpperCase()}
      </span>
      <div className={styles.composerBody}>
        <label htmlFor={textareaId} className={styles.composerLabel}>
          Posez votre question
        </label>
        <textarea
          id={textareaId}
          className={styles.textarea}
          placeholder={'Quelle est votre question ?'}
          value={text}
          onChange={(event) => handleChange(event.target.value)}
          aria-invalid={tooLong ? true : undefined}
          aria-describedby={describedBy}
          disabled={pending}
        />
        {tooLong ? (
          <p id={refusalId} className={styles.refusal}>
            {TOO_LONG_MESSAGE}
          </p>
        ) : null}
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <div className={styles.composerFooter}>
          <span id={hintId} className={styles.hint}>
            <FeedIcon name="globe" size={16} />
            <span>Tout le monde peut répondre</span>
          </span>
          <div className={styles.composerActions}>
            <span className={styles.counter} data-over={tooLong ? 'true' : undefined}>
              {length}/{QUESTION_MAX_LENGTH}
            </span>
            <button type="submit" className={`y-btn y-btn-primary ${styles.submit}`} disabled={!canSubmit}>
              {pending ? 'Publication…' : 'Poster'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

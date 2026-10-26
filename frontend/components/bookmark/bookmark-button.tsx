'use client';

import { useState } from 'react';
import { bookmarkFailureMessage, saveQuestion, unsaveQuestion } from '@/lib/bookmarks-api';

type BookmarkButtonProps = {
  /** Id of the question. */
  questionId: string;
  /** Whether the viewer saved the question when the button is first shown. */
  initialSaved: boolean;
  /** The viewer's account cannot save (suspended, pending deletion or verification): the button is off. */
  disabled?: boolean;
  /** Called with the new state once the API has accepted the change (not while it is pending). */
  onChange?: (saved: boolean) => void;
};

/**
 * The save button of a question card and of the saved list (L4). "Enregistrer" sends PUT; "Retirer des signets" sends
 * DELETE, and the state is exposed with aria-pressed. The state changes at once; a failed call gives the previous state
 * back and announces the message in a status region. The button is off while its call is pending, so a second click
 * sends nothing. The target is 44 px, as every touch target of the app.
 */
export function BookmarkButton({
  questionId,
  initialSaved,
  disabled = false,
  onChange,
}: BookmarkButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The card may be refreshed with another state: the button follows the value it is given at render time.
  const [seenInitial, setSeenInitial] = useState(initialSaved);
  if (seenInitial !== initialSaved) {
    setSeenInitial(initialSaved);
    setSaved(initialSaved);
  }

  async function toggle() {
    if (disabled || pending) {
      return;
    }
    const next = !saved;
    setSaved(next);
    setPending(true);
    setError(null);
    const result = next ? await saveQuestion(questionId) : await unsaveQuestion(questionId);
    setPending(false);
    if (result.ok) {
      onChange?.(next);
      return;
    }
    setSaved(!next);
    setError(bookmarkFailureMessage(result.problem, next));
  }

  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? 'Retirer des signets' : 'Enregistrer dans les signets'}
        aria-disabled={pending || undefined}
        disabled={disabled}
        onClick={toggle}
        style={{
          flex: 'none',
          minWidth: 44,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          borderRadius: '50%',
          background: 'transparent',
          color: saved ? 'var(--color-primary)' : 'var(--color-text-muted)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <span role="status" style={{ fontSize: 12, color: 'var(--color-destructive-text)' }}>
        {error ?? ''}
      </span>
    </>
  );
}

'use client';

import { useState } from 'react';
import questionStyles from '@/components/question/question.module.css';
import { followFailureMessage, unfollowUser } from '@/lib/follows-api';

type UnfollowMenuItemProps = {
  /** Handle of the account, without the @. */
  handle: string;
  /** Whether the viewer follows the account: the entry is shown only then. */
  follows: boolean;
  /** Called once the API has accepted the unfollow, so that the card can show the new state. */
  onUnfollowed?: () => void;
};

/**
 * The "Ne plus suivre @handle" entry of the card menu (L3, section 7.2). It sends the same DELETE as the follow pill.
 * The entry is absent when the viewer does not follow the account. A failed call keeps the entry and announces the
 * message in a status region.
 */
export function UnfollowMenuItem({ handle, follows, onUnfollowed }: UnfollowMenuItemProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!follows) {
    return null;
  }

  async function unfollow() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await unfollowUser(handle);
    setPending(false);
    if (result.ok) {
      onUnfollowed?.();
      return;
    }
    setError(followFailureMessage(result.problem, false));
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={questionStyles.menuItem}
        aria-disabled={pending || undefined}
        onClick={unfollow}
      >
        Ne plus suivre @{handle}
      </button>
      <p role="status" className={`${questionStyles.status} ${error ? questionStyles.statusFailed : ''}`}>
        {error ?? ''}
      </p>
    </>
  );
}

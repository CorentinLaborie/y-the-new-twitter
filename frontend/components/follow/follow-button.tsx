'use client';

import { useState } from 'react';
import { followFailureMessage, followUser, unfollowUser } from '@/lib/follows-api';

type FollowButtonProps = {
  /** Handle of the account, without the @. */
  handle: string;
  /** Whether the viewer follows the account when the button is first shown. */
  initialFollows: boolean;
  /** The viewer's account cannot follow (suspended, pending deletion or verification): the button is off. */
  disabled?: boolean;
  /** Called with the new state once the API has accepted the change (not while it is pending). */
  onChange?: (viewerFollows: boolean) => void;
};

/**
 * The follow pill of a card or of a profile (L3, section 7.2). "Suivre" sends PUT, "Suivi" sends DELETE. The state
 * changes at once (optimistic update); a failed call gives the previous state back and announces the message in a
 * status region. The button is off while its call is pending, so a second click sends nothing. Under the pointer, a
 * followed account reads "Ne plus suivre"; the accessible name stays "Suivi @handle" or "Suivre @handle".
 * The pill is shown at every screen size (the menu entry of the card is a second way, not a replacement).
 */
export function FollowButton({ handle, initialFollows, disabled = false, onChange }: FollowButtonProps) {
  const [follows, setFollows] = useState(initialFollows);
  const [hovered, setHovered] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The card may change the state from its menu ("Ne plus suivre"): the pill follows the new value at render time.
  const [seenInitial, setSeenInitial] = useState(initialFollows);
  if (seenInitial !== initialFollows) {
    setSeenInitial(initialFollows);
    setFollows(initialFollows);
  }

  async function toggle() {
    if (disabled || pending) {
      return;
    }
    const next = !follows;
    setFollows(next);
    setPending(true);
    setError(null);
    const result = next ? await followUser(handle) : await unfollowUser(handle);
    setPending(false);
    if (result.ok) {
      onChange?.(next);
      return;
    }
    setFollows(!next);
    setError(followFailureMessage(result.problem, next));
  }

  const visibleLabel = follows ? (hovered && !disabled ? 'Ne plus suivre' : 'Suivi') : 'Suivre';

  return (
    <>
      <button
        type="button"
        className={`y-follow y-follow-md${follows ? ' is-followed' : ''}`}
        // 44 px: the touch target of the pill (the design-system pill is 32 px high).
        style={{ minHeight: 44 }}
        aria-label={`${follows ? 'Suivi' : 'Suivre'} @${handle}`}
        aria-disabled={pending || undefined}
        disabled={disabled}
        onClick={toggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {visibleLabel}
      </button>
      <span role="status" style={{ fontSize: 12, color: 'var(--color-destructive-text)' }}>
        {error ?? ''}
      </span>
    </>
  );
}

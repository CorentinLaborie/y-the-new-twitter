'use client';

import type { MentionSuggestion } from '@/lib/mention-api';
import styles from './mention-picker.module.css';

export type MentionPickerProps = {
  id: string;
  /** The accounts proposed for the handle typed so far, already in the order to show them. */
  suggestions: readonly MentionSuggestion[];
  /** The row the keyboard is on. The composer moves it with the arrow keys. */
  activeIndex: number;
  /** Called with the handle of the account picked by a click. */
  onPick: (handle: string) => void;
  /** The name of the list for screen readers. */
  label?: string;
};

/**
 * The accounts proposed while a reply is typed after an '@' (section M3). Each row is at least 44 px high. The composer
 * handles the keyboard (arrows, Entrée, Échap) and keeps the focus in the textarea.
 */
export function MentionPicker({
  id,
  suggestions,
  activeIndex,
  onPick,
  label = 'Comptes à mentionner',
}: MentionPickerProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div id={id} role="listbox" aria-label={label} className={styles.picker}>
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.handle}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={styles.option}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(suggestion.handle)}
        >
          <span className={styles.name}>{suggestion.displayName}</span>
          <span className={styles.handle}>@{suggestion.handle}</span>
        </button>
      ))}
    </div>
  );
}

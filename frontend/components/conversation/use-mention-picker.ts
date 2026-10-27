'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { fetchMentionSuggestions, type MentionSuggestion } from '@/lib/mention-api';
import { insertMention, mentionQueryAt, type MentionQuery } from '@/lib/mention-picker';

/** The selector open under a textarea: the mention being typed, the accounts proposed and the row the keyboard is on. */
export type PickerState = { mention: MentionQuery; suggestions: MentionSuggestion[]; activeIndex: number };

/**
 * The '@' selector of a text field (section M3), shared by the question and the reply composers. The caller keeps the
 * text: it calls `onTextChange` after each edit, `handleKeyDown` before its own keys, and stores the text this returns
 * when an account is picked. The caret is put back after the picked handle, in the textarea of `textareaRef`.
 */
export function useMentionPicker(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const [picker, setPicker] = useState<PickerState | null>(null);
  const pickerId = useId();
  // Each suggestion request gets a number: an answer that is no longer the latest one is dropped.
  const suggestionRequest = useRef(0);
  // The caret to put back in the textarea once a picked mention has been written.
  const caretAfterPick = useRef<number | null>(null);

  useEffect(() => {
    if (caretAfterPick.current !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(caretAfterPick.current, caretAfterPick.current);
      caretAfterPick.current = null;
    }
  });

  /** Closes the selector and drops the answer of any request still on its way. */
  function close() {
    suggestionRequest.current += 1;
    setPicker(null);
  }

  async function open(mention: MentionQuery | null) {
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

  /** Call after each edit of the text, with the new text and the caret. */
  function onTextChange(value: string, caret: number) {
    void open(mentionQueryAt(value, caret));
  }

  /** The text once `handle` is picked, in place of the mention being typed. The selector closes. */
  function pick(text: string, handle: string): string {
    if (picker === null) {
      return text;
    }
    const inserted = insertMention(text, picker.mention, handle);
    close();
    caretAfterPick.current = inserted.caret;

    return inserted.text;
  }

  /**
   * The keys of the selector while it is open: arrows move, Entrée picks, Échap closes. Returns the new text when an
   * account is picked, or null when the key is not the selector's.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, text: string): string | null {
    if (picker === null) {
      return null;
    }
    const count = picker.suggestions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setPicker({ ...picker, activeIndex: (picker.activeIndex + step + count) % count });
      return null;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const active = picker.suggestions[picker.activeIndex];
      return active ? pick(text, active.handle) : null;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    return null;
  }

  return {
    picker,
    pickerId,
    close,
    onTextChange,
    pick,
    handleKeyDown,
  };
}

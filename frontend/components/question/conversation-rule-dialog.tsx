'use client';

import { useEffect, useId, useRef } from 'react';
import styles from './question.module.css';

type ConversationRuleDialogProps = {
  open: boolean;
  /** The Y count that opens the conversation (R3): read from the question, never hard-coded. */
  yThreshold: number;
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Short dialog that explains the 50 Y rule (F10). A centred dialog from 768 px, a bottom sheet under 768 px (the same
 * element, see question.module.css). Escape and the close buttons call onClose; Tab stays inside the dialog; focus goes
 * back to the element that had it when the dialog opened (the information button, see QuestionCard).
 */
export function ConversationRuleDialog({ open, yThreshold, onClose }: ConversationRuleDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog on open and returns to the opener on close.
  useEffect(() => {
    if (!open) {
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      opener?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== 'Tab' || !dialog) {
        return;
      }
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
      >
        <div className={styles.dialogHead}>
          <h2 id={titleId} className={styles.dialogTitle}>
            Les {yThreshold} Y
          </h2>
          <button type="button" className={styles.closeButton} aria-label="Fermer" onClick={onClose}>
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <p className={styles.dialogText}>
          La conversation d’une question s’ouvre lorsqu’elle atteint {yThreshold} Y. Vous pouvez alors
          répondre, et la conversation reste ouverte ensuite.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.primaryButton} onClick={onClose}>
            Compris
          </button>
        </div>
      </div>
    </>
  );
}

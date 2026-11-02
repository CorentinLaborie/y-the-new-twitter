'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './sheet-dialog.module.css';

type SheetDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  /** Under 768 px: a sheet at the bottom of the screen (default), or the full screen (the profile edit window). */
  mobile?: 'sheet' | 'fullscreen';
  onCancel: () => void;
  children: ReactNode;
};

/*
 * The container of the report, block and profile edit dialogs (plan L6, DEC-103; plan L1, section 12.7). On desktop and
 * tablet it is a centred dialog; under 768 px it is a sheet at the bottom of the screen, or the full screen when asked.
 * Both use the native <dialog>, so showModal() traps the focus, makes the page behind inert, and Escape sends the cancel
 * event, which goes to onCancel. The parent closes it through `open`: the native close is left to the effect below.
 */
export function SheetDialog({
  open,
  title,
  description,
  mobile = 'sheet',
  onCancel,
  children,
}: SheetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`y-dialog ${styles.sheet} ${mobile === 'fullscreen' ? styles.fullscreen : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : textId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {description === undefined ? null : (
        <p id={textId} className="y-dialog-text">
          {description}
        </p>
      )}
      {children}
    </dialog>
  );
}

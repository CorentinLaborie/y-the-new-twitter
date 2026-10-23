'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './sheet-dialog.module.css';

type SheetDialogProps = {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  children: ReactNode;
};

/*
 * The container of the report and block dialogs (plan L6, DEC-103). On desktop and tablet it is a centred dialog; under
 * 768 px it is a sheet at the bottom of the screen, with the same content. Both use the native <dialog>, so showModal()
 * traps the focus, makes the page behind inert, and Escape sends the cancel event, which goes to onCancel.
 * The parent closes it through `open`: the native close is left to the effect below.
 */
export function SheetDialog({ open, title, description, onCancel, children }: SheetDialogProps) {
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
      className={`y-dialog ${styles.sheet}`}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={textId} className="y-dialog-text">
        {description}
      </p>
      {children}
    </dialog>
  );
}

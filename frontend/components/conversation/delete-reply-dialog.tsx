'use client';

import { useEffect, useId, useRef } from 'react';

type DeleteReplyDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/*
 * Confirmation before a reply of the viewer is deleted (F6). The repo has no dialog component, so this one is the
 * native <dialog>: showModal() traps the focus and makes the page behind inert, and Escape sends the cancel event.
 * The look is the design-system dialog (y-dialog, board Reply-Delete). The first button in the DOM is Annuler, so the
 * focus lands on it when the dialog opens.
 */
export function DeleteReplyDialog({ open, onConfirm, onCancel }: DeleteReplyDialogProps) {
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
      className="y-dialog"
      style={{ border: 0 }}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(event) => {
        // The parent closes the dialog through `open`, so the native close is left to the effect above.
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>Supprimer cette réponse ?</h2>
      <p id={textId} className="y-dialog-text">
        Votre réponse sera retirée du fil. Cette action est définitive.
      </p>
      <div className="y-dialog-actions">
        <button
          type="button"
          className="y-btn y-btn-md y-btn-outline y-btn-pill y-btn-block"
          onClick={onCancel}
        >
          Annuler
        </button>
        <button
          type="button"
          className="y-btn y-btn-md y-btn-danger y-btn-pill y-btn-block"
          onClick={onConfirm}
        >
          Supprimer
        </button>
      </div>
    </dialog>
  );
}

'use client';

import { useState } from 'react';
import { SheetDialog } from '@/components/dialog/sheet-dialog';
import { blockAccount } from '@/lib/blocks-api';
import { BLOCK_FAILED_MESSAGE, BLOCK_NOT_FOUND_MESSAGE, blockDescription, BLOCK_FOLLOWS_NOTE, blockTitle } from './block-rules';

type BlockDialogProps = {
  open: boolean;
  /** The handle of the account to block, without the @. */
  handle: string;
  onClose: () => void;
  /** Called once the block is recorded. The caller removes what the account wrote from its view. */
  onBlocked: () => void;
};

/*
 * The block dialog (plan L6, sections 7 and 8). Blocking asks for a confirmation (R14); the blocked account is not told.
 * The container is SheetDialog, as for the report. The form is mounted only while open, so each opening starts fresh.
 */
export function BlockDialog({ open, handle, onClose, onBlocked }: BlockDialogProps) {
  return (
    <SheetDialog open={open} title={blockTitle(handle)} description={blockDescription(handle)} onCancel={onClose}>
      {open ? <BlockForm handle={handle} onClose={onClose} onBlocked={onBlocked} /> : null}
    </SheetDialog>
  );
}

type BlockFormProps = Pick<BlockDialogProps, 'handle' | 'onClose' | 'onBlocked'>;

function BlockForm({ handle, onClose, onBlocked }: BlockFormProps) {
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<'failed' | 'not-found' | null>(null);

  async function block() {
    if (sending) {
      return;
    }
    setSending(true);
    setFailure(null);
    const result = await blockAccount(handle);
    setSending(false);
    if (result.ok) {
      onBlocked();
      return;
    }
    setFailure(result.problem.status === 404 ? 'not-found' : 'failed');
  }

  return (
    <>
      <p className="y-dialog-text">{BLOCK_FOLLOWS_NOTE}</p>
      {failure === 'failed' ? <p role="alert">{BLOCK_FAILED_MESSAGE}</p> : null}
      {failure === 'not-found' ? <p role="alert">{BLOCK_NOT_FOUND_MESSAGE}</p> : null}
      <div className="y-dialog-actions">
        {failure === 'not-found' ? (
          <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill y-btn-block" onClick={onClose}>
            Fermer
          </button>
        ) : (
          <>
            <button
              type="button"
              className="y-btn y-btn-md y-btn-outline y-btn-pill y-btn-block"
              onClick={onClose}
              disabled={sending}
            >
              Annuler
            </button>
            <button
              type="button"
              className="y-btn y-btn-md y-btn-danger y-btn-pill y-btn-block"
              onClick={block}
              disabled={sending}
            >
              {sending ? 'Envoi…' : 'Bloquer'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

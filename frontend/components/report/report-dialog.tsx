'use client';

import { useId, useState } from 'react';
import { SheetDialog } from '@/components/dialog/sheet-dialog';
import { newIdempotencyKey } from '@/lib/idempotency';
import {
  createReport,
  isReportDetailsValid,
  REPORT_DETAILS_MAX_LENGTH,
  reportDetailsLength,
  type ReportReason,
  type ReportTarget,
} from '@/lib/reports-api';
import {
  REPORT_DETAILS_REQUIRED_MESSAGE,
  REPORT_FAILED_MESSAGE,
  REPORT_REASON_OPTIONS,
  REPORT_UNAVAILABLE_MESSAGE,
} from './report-rules';

type ReportDialogProps = {
  open: boolean;
  /** The content reported: a question or a reply. */
  target: ReportTarget;
  kind: 'question' | 'reply';
  onClose: () => void;
  /** Called once the report is recorded. The content stays as it is. */
  onSent: () => void;
};

/*
 * The report dialog (plan L6, sections 7 and 8). The container is SheetDialog: a centred dialog on desktop and tablet,
 * a sheet at the bottom of the screen under 768 px. The form inside is mounted only while the dialog is open, so each
 * opening starts from an empty choice and a new Idempotency-Key.
 */
export function ReportDialog({ open, target, kind, onClose, onSent }: ReportDialogProps) {
  const noun = kind === 'question' ? 'cette question' : 'cette réponse';

  return (
    <SheetDialog
      open={open}
      title={`Signaler ${noun}`}
      description={`Choisissez le motif qui correspond le mieux à ${noun}.`}
      onCancel={onClose}
    >
      {open ? <ReportForm target={target} onClose={onClose} onSent={onSent} /> : null}
    </SheetDialog>
  );
}

type ReportFormProps = Pick<ReportDialogProps, 'target' | 'onClose' | 'onSent'>;

/**
 * One reason from six, and details for `other`. Signaler stays disabled until the choice is valid, and every control is
 * disabled while the request is sent, so a report is sent once. The Idempotency-Key is made with the form: a repeated
 * submit, or a dropped connection, returns the first report. A 404 means the content is no longer visible.
 */
function ReportForm({ target, onClose, onSent }: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<'failed' | 'unavailable' | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const groupId = useId();
  const detailsId = useId();

  const sentDetails = reason === 'other' ? details : undefined;
  const valid = reason !== null && isReportDetailsValid(reason, details);

  async function send() {
    if (!reason || !valid || sending) {
      return;
    }
    setSending(true);
    setFailure(null);
    const result = await createReport(target, reason, sentDetails, idempotencyKey);
    setSending(false);
    if (result.ok) {
      onSent();
      return;
    }
    setFailure(result.problem.status === 404 ? 'unavailable' : 'failed');
  }

  return (
    <>
      <fieldset disabled={sending} style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="y-dialog-text" style={{ margin: '0 0 8px', padding: 0 }}>
          Motif du signalement
        </legend>
        {REPORT_REASON_OPTIONS.map((option) => (
          <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <input
              type="radio"
              name={groupId}
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
            />
            {option.label}
          </label>
        ))}
        {reason === 'other' ? (
          <div style={{ marginTop: 8 }}>
            <label htmlFor={detailsId}>Précisez le motif ({REPORT_DETAILS_MAX_LENGTH} caractères au maximum)</label>
            <textarea
              id={detailsId}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6 }}
            />
            <p className="y-dialog-text" style={{ margin: '4px 0 0' }}>
              {reportDetailsLength(details)} / {REPORT_DETAILS_MAX_LENGTH}
            </p>
            {details.trim() === '' ? <p role="alert">{REPORT_DETAILS_REQUIRED_MESSAGE}</p> : null}
          </div>
        ) : null}
      </fieldset>

      {failure === 'failed' ? <p role="alert">{REPORT_FAILED_MESSAGE}</p> : null}
      {failure === 'unavailable' ? <p role="alert">{REPORT_UNAVAILABLE_MESSAGE}</p> : null}

      <div className="y-dialog-actions">
        {failure === 'unavailable' ? (
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
              onClick={send}
              disabled={!valid || sending}
            >
              {sending ? 'Envoi…' : 'Signaler'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

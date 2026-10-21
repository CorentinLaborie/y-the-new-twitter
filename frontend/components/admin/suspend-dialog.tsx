'use client';

import { useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin/admin-dialog';
import { ReauthDialog } from '@/components/admin/reauth-dialog';
import styles from '@/components/admin/admin.module.css';
import { suspendAccount, type StatusChangeResult } from '@/lib/admin-api';
import { needsReauthentication, suspensionReasonError } from '@/lib/admin-suspension';

/**
 * Suspends an account with a required reason. When the API asks for a re-authentication, the re-authentication dialog
 * opens, and the suspension is sent again as soon as it is confirmed. The reason typed is kept while that happens.
 */
export function SuspendDialog({
  accountId,
  handle,
  onSuspended,
  onCancel,
}: {
  accountId: string;
  handle: string;
  onSuspended: (result: StatusChangeResult) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);

  const reasonError = reason.trim() === '' ? null : suspensionReasonError(reason);
  const canSubmit = suspensionReasonError(reason) === null && !submitting;

  async function suspend() {
    setMessage(null);
    setSubmitting(true);
    const result = await suspendAccount(accountId, reason.trim());
    setSubmitting(false);

    if (result.ok) {
      onSuspended(result.body);
      return;
    }
    if (needsReauthentication(result.problem)) {
      setReauthRequired(true);
      return;
    }
    setMessage(result.problem.detail);
  }

  if (reauthRequired) {
    return (
      <ReauthDialog
        actionLabel={`suspendre le compte de @${handle}`}
        onConfirmed={() => {
          setReauthRequired(false);
          void suspend();
        }}
        onCancel={() => setReauthRequired(false)}
      />
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) {
      void suspend();
    }
  }

  return (
    <AdminDialog titleId="suspend-title" title={`Suspendre le compte de @${handle} ?`} onClose={onCancel}>
      <p className={styles.dialogText}>
        Le compte ne pourra plus publier, réagir ni répondre. Ses sessions sont fermées immédiatement.
        L’utilisateur reçoit un e-mail. La suspension dure jusqu’à sa réactivation par l’administrateur.
      </p>
      {message ? (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      ) : null}
      <form className={styles.dialogForm} noValidate onSubmit={handleSubmit}>
        <label className={styles.fieldLabel} htmlFor="suspend-reason">
          Motif (obligatoire)
        </label>
        <textarea
          id="suspend-reason"
          name="reason"
          rows={3}
          className={styles.textarea}
          placeholder="Expliquez la décision"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? 'suspend-reason-hint suspend-reason-error' : 'suspend-reason-hint'}
          autoFocus
        />
        <span id="suspend-reason-hint" className={styles.fieldHint}>
          Enregistré dans le journal d’audit.
        </span>
        {reasonError ? (
          <span id="suspend-reason-error" className={styles.fieldError}>
            {reasonError}
          </span>
        ) : null}
        <p className={styles.dialogHint}>
          Action sensible : confirmation par mot de passe et code requise à l’étape suivante.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className={styles.dangerButton} disabled={!canSubmit}>
            {submitting ? 'Suspension…' : 'Suspendre le compte'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

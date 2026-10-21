'use client';

import { useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin/admin-dialog';
import { ReauthDialog } from '@/components/admin/reauth-dialog';
import styles from '@/components/admin/admin.module.css';
import { reactivateAccount, type StatusChangeResult } from '@/lib/admin-api';
import { needsReauthentication, suspensionReasonError } from '@/lib/admin-suspension';

/**
 * Lifts the suspension of an account with a required reason. When the API asks for a re-authentication, the
 * re-authentication dialog opens, and the change is sent again as soon as it is confirmed. The reason typed is kept
 * while that happens.
 */
export function ReactivateDialog({
  accountId,
  handle,
  onReactivated,
  onCancel,
}: {
  accountId: string;
  handle: string;
  onReactivated: (result: StatusChangeResult) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);

  const reasonError = reason.trim() === '' ? null : suspensionReasonError(reason);
  const canSubmit = suspensionReasonError(reason) === null && !submitting;

  async function reactivate() {
    setMessage(null);
    setSubmitting(true);
    const result = await reactivateAccount(accountId, reason.trim());
    setSubmitting(false);

    if (result.ok) {
      onReactivated(result.body);
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
        actionLabel={`lever la suspension du compte de @${handle}`}
        onConfirmed={() => {
          setReauthRequired(false);
          void reactivate();
        }}
        onCancel={() => setReauthRequired(false)}
      />
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) {
      void reactivate();
    }
  }

  return (
    <AdminDialog titleId="reactivate-title" title={`Lever la suspension de @${handle} ?`} onClose={onCancel}>
      <p className={styles.dialogText}>
        Le compte pourra de nouveau publier, réagir et répondre. L’utilisateur reçoit un e-mail.
      </p>
      {message ? (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      ) : null}
      <form className={styles.dialogForm} noValidate onSubmit={handleSubmit}>
        <label className={styles.fieldLabel} htmlFor="reactivate-reason">
          Motif (obligatoire)
        </label>
        <textarea
          id="reactivate-reason"
          name="reason"
          rows={3}
          className={styles.textarea}
          placeholder="Expliquez la décision"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? 'reactivate-reason-hint reactivate-reason-error' : 'reactivate-reason-hint'}
          autoFocus
        />
        <span id="reactivate-reason-hint" className={styles.fieldHint}>
          Enregistré dans le journal d’audit.
        </span>
        {reasonError ? (
          <span id="reactivate-reason-error" className={styles.fieldError}>
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
          <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
            {submitting ? 'Levée en cours…' : 'Lever la suspension'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

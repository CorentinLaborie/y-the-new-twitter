'use client';

import { useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin/admin-dialog';
import { ReauthDialog } from '@/components/admin/reauth-dialog';
import styles from '@/components/admin/admin.module.css';
import { deleteAccount, type DeletionReasonCode, type StatusChangeResult } from '@/lib/admin-api';
import { deletionReasonError } from '@/lib/admin-deletion';
import { DELETION_REASON_OPTIONS } from '@/lib/admin-labels';
import { needsReauthentication } from '@/lib/admin-suspension';

/**
 * Starts the deletion of an account, with a reason picked from the list, or a free text with "Autre". When the API asks
 * for a re-authentication, the re-authentication dialog opens, and the deletion is sent again once it is confirmed.
 * The reason chosen is kept while that happens.
 */
export function DeleteAccountDialog({
  accountId,
  handle,
  onDeleted,
  onCancel,
}: {
  accountId: string;
  handle: string;
  onDeleted: (result: StatusChangeResult) => void;
  onCancel: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<DeletionReasonCode | ''>('');
  const [otherReason, setOtherReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);

  const reasonError = reasonCode === '' ? null : deletionReasonError(reasonCode, otherReason);
  const canSubmit = reasonCode !== '' && deletionReasonError(reasonCode, otherReason) === null && !submitting;

  async function remove() {
    if (reasonCode === '') {
      return;
    }
    setMessage(null);
    setSubmitting(true);
    const result = await deleteAccount(
      accountId,
      reasonCode,
      reasonCode === 'other' ? otherReason.trim() : undefined,
    );
    setSubmitting(false);

    if (result.ok) {
      onDeleted(result.body);
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
        actionLabel={`supprimer le compte de @${handle}`}
        onConfirmed={() => {
          setReauthRequired(false);
          void remove();
        }}
        onCancel={() => setReauthRequired(false)}
      />
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) {
      void remove();
    }
  }

  return (
    <AdminDialog titleId="delete-title" title={`Supprimer le compte de @${handle} ?`} onClose={onCancel}>
      <p className={styles.dialogText}>
        Le compte est programmé pour suppression : il sera supprimé définitivement dans 90 jours. Pendant ce délai,
        l’utilisateur ne peut plus se connecter. Ses sessions sont fermées immédiatement, et il reçoit un e-mail avec
        le motif.
      </p>
      {message ? (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      ) : null}
      <form className={styles.dialogForm} noValidate onSubmit={handleSubmit}>
        <div className={styles.selectField}>
          <label htmlFor="delete-reason">Motif (obligatoire)</label>
          <select
            id="delete-reason"
            name="reason"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as DeletionReasonCode | '')}
            autoFocus
          >
            <option value="">Choisir un motif</option>
            {DELETION_REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {reasonCode === 'other' ? (
          <>
            <label className={styles.fieldLabel} htmlFor="delete-other-reason">
              Précisez le motif
            </label>
            <textarea
              id="delete-other-reason"
              name="otherReason"
              rows={3}
              className={styles.textarea}
              placeholder="Expliquez la décision"
              value={otherReason}
              onChange={(event) => setOtherReason(event.target.value)}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? 'delete-other-reason-error' : undefined}
            />
            {reasonError ? (
              <span id="delete-other-reason-error" className={styles.fieldError}>
                {reasonError}
              </span>
            ) : null}
          </>
        ) : null}
        <span className={styles.fieldHint}>
          Enregistré dans le journal d’audit et envoyé à l’utilisateur par e-mail.
        </span>
        <p className={styles.dialogHint}>
          Action sensible : confirmation par mot de passe et code requise à l’étape suivante.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className={styles.dangerButton} disabled={!canSubmit}>
            {submitting ? 'Suppression…' : 'Supprimer le compte'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

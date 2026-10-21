'use client';

import { useState } from 'react';
import { AdminDialog } from '@/components/admin/admin-dialog';
import { ReauthDialog } from '@/components/admin/reauth-dialog';
import styles from '@/components/admin/admin.module.css';
import { closeSupportThread, type SupportThreadDetail } from '@/lib/admin-api';
import { needsReauthentication } from '@/lib/admin-suspension';

/**
 * Closes a contact thread as handled. Nothing is sent to the account. When the API asks for a re-authentication, the
 * re-authentication dialog opens, and the closing is sent again as soon as it is confirmed.
 */
export function CloseThreadDialog({
  threadId,
  onClosed,
  onCancel,
}: {
  threadId: string;
  onClosed: (thread: SupportThreadDetail) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);

  async function close() {
    setMessage(null);
    setSubmitting(true);
    const result = await closeSupportThread(threadId);
    setSubmitting(false);

    if (result.ok) {
      onClosed(result.body);
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
        actionLabel="marquer ce message comme traité"
        onConfirmed={() => {
          setReauthRequired(false);
          void close();
        }}
        onCancel={() => setReauthRequired(false)}
      />
    );
  }

  return (
    <AdminDialog titleId="close-thread-title" title="Marquer ce message comme traité ?" onClose={onCancel}>
      <p className={styles.dialogText}>
        Le fil est fermé et aucun e-mail n’est envoyé. Si le compte écrit de nouveau, un nouveau fil est
        ouvert.
      </p>
      {message ? (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      ) : null}
      <p className={styles.dialogHint}>
        Action sensible : confirmation par mot de passe et code requise à l’étape suivante.
      </p>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={submitting}
          onClick={() => void close()}
        >
          {submitting ? 'Fermeture…' : 'Marquer comme traité'}
        </button>
      </div>
    </AdminDialog>
  );
}

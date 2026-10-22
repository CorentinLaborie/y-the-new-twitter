'use client';

import { useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin/admin-dialog';
import styles from '@/components/admin/admin.module.css';
import { TextField } from '@/components/auth/text-field';
import { reauthenticate } from '@/lib/admin-api';

/**
 * Asks the administrator for the password again before a sensitive action (DEC-088). The answer of the API is shown as
 * it is: a wrong password keeps the dialog open.
 */
export function ReauthDialog({
  actionLabel,
  onConfirmed,
  onCancel,
}: {
  actionLabel: string;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password === '') {
      setMessage('Saisissez votre mot de passe.');
      return;
    }

    setMessage(null);
    setSubmitting(true);
    const result = await reauthenticate(password);
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.problem.detail);
      return;
    }
    onConfirmed();
  }

  return (
    <AdminDialog titleId="reauth-title" title="Confirmer votre identité" onClose={onCancel}>
      <p className={styles.dialogText}>
        Action demandée : {actionLabel}. Cette action est enregistrée dans le journal d’audit.
      </p>
      {message ? (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      ) : null}
      <form className={styles.dialogForm} noValidate onSubmit={handleSubmit}>
        <fieldset className={styles.fieldset} disabled={submitting}>
          <TextField
            id="reauth-password"
            name="password"
            type="password"
            label="Mot de passe"
            placeholder="Votre mot de passe"
            revealable
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
          <p className={styles.dialogHint}>La confirmation reste valable 10 minutes.</p>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className={styles.primaryButton}>
              {submitting ? 'Vérification…' : 'Confirmer'}
            </button>
          </div>
        </fieldset>
      </form>
    </AdminDialog>
  );
}

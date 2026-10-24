'use client';

import { useState, type FormEvent } from 'react';
import { SheetDialog } from '@/components/dialog/sheet-dialog';
import { tooManyAttemptsMessage } from '@/components/auth/messages';
import {
  DELETION_REASONS,
  requestAccountDeletion,
  type AccountDeletionRequest,
  type DeletionReasonCode,
} from '@/lib/settings-api';

/** The validated texts of the deletion page (plan L5, section 6.5, decisions 18 and 19), copied word for word. */
const EXPLANATION =
  'Votre demande de suppression est en cours. Vos données sont conservées pendant 90 jours. Pour annuler, reconnectez-vous à votre compte avant la fin de ce délai. Après 90 jours, le compte et les données personnelles sont supprimés.';
const SAVED_MESSAGE = 'Votre demande de suppression est enregistrée. Reconnectez-vous avant 90 jours pour l’annuler.';
const CONFIRM_LABEL = 'Supprimer mon compte';
const CONFIRM_TITLE = 'Demander la suppression de votre compte ?';
const CONFIRM_DESCRIPTION = 'Votre compte sera supprimé définitivement à l’issue de 90 jours.';
const OTHER_REQUIRED = 'Précisez le motif pour continuer.';
const WRONG_PASSWORD = 'Le mot de passe est incorrect.';
const FAILED = 'La demande n’a pas pu être enregistrée. Réessayez.';
const OTHER_MAX_LENGTH = 500;

type Stage = 'form' | 'saved';

/** The purge date in French, in Paris time, as the page shows it. */
function formatPurgeDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(iso));
}

/*
 * The account deletion (plan L5, section 6.5). Step 1 is the explanation, the password, the reason and the e-mail.
 * Step 2 is a confirmation dialog: its initial focus is on Annuler. After the request the page shows the saved message
 * and the purge date, and the button to go to the login page (the owner chose to stay on the page, decision 2026-10-23).
 */
export function DeleteAccountForm() {
  const [stage, setStage] = useState<Stage>('form');
  const [password, setPassword] = useState('');
  const [reasonCode, setReasonCode] = useState<DeletionReasonCode | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ password?: string; reason?: string; email?: string; other?: string }>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [purgeAt, setPurgeAt] = useState<string | null>(null);

  function validate(): boolean {
    const found: typeof errors = {};
    if (password === '') {
      found.password = 'Saisissez votre mot de passe.';
    }
    if (reasonCode === null) {
      found.reason = 'Choisissez un motif.';
    }
    if (reasonCode === 'other' && otherReason.trim() === '') {
      found.other = OTHER_REQUIRED;
    }
    if (email.trim() === '') {
      found.email = 'Saisissez une adresse e-mail.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  function askConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    if (validate()) {
      setConfirming(true);
    }
  }

  async function confirm() {
    if (sending || reasonCode === null) {
      return;
    }
    setSending(true);
    setFormMessage(null);
    const request: AccountDeletionRequest = {
      password,
      reasonCode,
      email: email.trim(),
      ...(reasonCode === 'other' ? { otherReason: otherReason.trim() } : {}),
    };
    const result = await requestAccountDeletion(request);
    setSending(false);
    setConfirming(false);
    if (result.ok) {
      setPurgeAt(result.body.deletionPurgeAt);
      setStage('saved');
      return;
    }
    if (result.problem.status === 422) {
      setErrors({ password: WRONG_PASSWORD });
      return;
    }
    setFormMessage(result.problem.status === 429 ? tooManyAttemptsMessage(result.problem) : FAILED);
  }

  if (stage === 'saved' && purgeAt !== null) {
    return (
      <div>
        <p role="status" tabIndex={-1}>
          {SAVED_MESSAGE}
        </p>
        <p>
          Date de purge prévue : <strong>{formatPurgeDate(purgeAt)}</strong>.
        </p>
        <a href="/login" className="y-btn y-btn-md y-btn-outline y-btn-pill" style={{ minHeight: 44 }}>
          Aller à la connexion
        </a>
      </div>
    );
  }

  return (
    <>
      <p>{EXPLANATION}</p>
      <form onSubmit={askConfirmation} noValidate aria-busy={sending}>
        <div>
          <label htmlFor="delete-password">Mot de passe actuel</label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
          />
          {errors.password ? <p role="alert">{errors.password}</p> : null}
        </div>

        <fieldset style={{ border: 0, margin: '16px 0 0', padding: 0 }}>
          <legend>Motif de la suppression</legend>
          {DELETION_REASONS.map((reason) => (
            <label key={reason.value} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <input
                type="radio"
                name="delete-reason"
                value={reason.value}
                checked={reasonCode === reason.value}
                onChange={() => setReasonCode(reason.value)}
              />
              {reason.label}
            </label>
          ))}
          {errors.reason ? <p role="alert">{errors.reason}</p> : null}
        </fieldset>

        {reasonCode === 'other' ? (
          <div>
            <label htmlFor="delete-other">Précisez le motif</label>
            <textarea
              id="delete-other"
              maxLength={OTHER_MAX_LENGTH}
              value={otherReason}
              onChange={(event) => setOtherReason(event.target.value)}
              rows={3}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
            />
            {errors.other ? <p role="alert">{errors.other}</p> : null}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <label htmlFor="delete-email">Adresse e-mail</label>
          <input
            id="delete-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
          />
          {errors.email ? <p role="alert">{errors.email}</p> : null}
        </div>

        <button type="submit" className="y-btn y-btn-md y-btn-danger y-btn-pill" style={{ minHeight: 44, marginTop: 16 }}>
          Demander la suppression
        </button>
        {formMessage !== null ? <p role="alert">{formMessage}</p> : null}
      </form>

      <SheetDialog open={confirming} title={CONFIRM_TITLE} description={CONFIRM_DESCRIPTION} onCancel={() => setConfirming(false)}>
        <div className="y-dialog-actions">
          <button
            type="button"
            className="y-btn y-btn-md y-btn-outline y-btn-pill y-btn-block"
            style={{ minHeight: 44 }}
            autoFocus
            onClick={() => setConfirming(false)}
          >
            Annuler
          </button>
          <button
            type="button"
            className="y-btn y-btn-md y-btn-danger y-btn-pill y-btn-block"
            style={{ minHeight: 44 }}
            onClick={confirm}
            disabled={sending}
          >
            {CONFIRM_LABEL}
          </button>
        </div>
      </SheetDialog>
    </>
  );
}

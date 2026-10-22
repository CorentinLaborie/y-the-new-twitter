'use client';

import { useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin/admin-dialog';
import { ReauthDialog } from '@/components/admin/reauth-dialog';
import styles from '@/components/admin/admin.module.css';
import { decideReport, type ReportDecisionName, type ReportDecisionResult } from '@/lib/admin-api';
import { needsReauthentication } from '@/lib/admin-suspension';
import { decisionNoteError } from '@/lib/admin-reports';

/** The French texts of the two decisions: the title, the explanation and the button. */
const DECISION_TEXTS: Record<
  ReportDecisionName,
  { title: string; text: string; action: string; busy: string }
> = {
  hide: {
    title: 'Masquer ce contenu ?',
    text: 'Le contenu n’apparaîtra plus dans Y. Les autres signalements ouverts sur ce contenu sont clos avec lui.',
    action: 'Masquer le contenu',
    busy: 'Masquage…',
  },
  dismiss: {
    title: 'Rejeter ce signalement ?',
    text: 'Le contenu reste visible. Seul ce signalement est clos.',
    action: 'Rejeter le signalement',
    busy: 'Rejet…',
  },
};

/**
 * Records the decision on a report with its required note. When the API asks for a re-authentication, the re-authentication
 * dialog opens, and the decision is sent again as soon as it is confirmed. The note typed is kept while that happens.
 */
export function ReportDecisionDialog({
  reportId,
  decision,
  onDecided,
  onCancel,
}: {
  reportId: string;
  decision: ReportDecisionName;
  onDecided: (result: ReportDecisionResult) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const texts = DECISION_TEXTS[decision];

  const noteError = note.trim() === '' ? null : decisionNoteError(note);
  const canSubmit = decisionNoteError(note) === null && !submitting;

  async function decide() {
    setMessage(null);
    setSubmitting(true);
    const result = await decideReport(reportId, decision, note.trim());
    setSubmitting(false);

    if (result.ok) {
      onDecided(result.body);
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
        actionLabel={texts.action.toLowerCase()}
        onConfirmed={() => {
          setReauthRequired(false);
          void decide();
        }}
        onCancel={() => setReauthRequired(false)}
      />
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) {
      void decide();
    }
  }

  return (
    <AdminDialog titleId="decision-title" title={texts.title} onClose={onCancel}>
      <p className={styles.dialogText}>{texts.text}</p>
      {message ? (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      ) : null}
      <form className={styles.dialogForm} noValidate onSubmit={handleSubmit}>
        <label className={styles.fieldLabel} htmlFor="decision-note">
          Motif (obligatoire)
        </label>
        <textarea
          id="decision-note"
          name="note"
          rows={3}
          className={styles.textarea}
          placeholder="Expliquez la décision"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? 'decision-note-hint decision-note-error' : 'decision-note-hint'}
          autoFocus
        />
        <span id="decision-note-hint" className={styles.fieldHint}>
          Enregistré dans le journal d’audit.
        </span>
        {noteError ? (
          <span id="decision-note-error" className={styles.fieldError}>
            {noteError}
          </span>
        ) : null}
        <p className={styles.dialogHint}>
          Action sensible : confirmation par mot de passe requise à l’étape suivante.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
            {submitting ? texts.busy : texts.action}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

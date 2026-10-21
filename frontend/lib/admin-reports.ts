/*
 * Rules of the report decisions and of the answers to a contact thread (back-office, admin 2). Pure functions, so they are
 * unit tested without a browser. The limits are those of the API.
 */

/** The longest note of a decision, kept as the reason of the audit entry (DEC-081). */
const DECISION_NOTE_MAX_LENGTH = 500;

/** The longest answer to an account, in characters (the contact messages limit, DEC-078). */
const SUPPORT_REPLY_MAX_LENGTH = 1000;

/** The French message for a decision note that the API would refuse, or null when it is acceptable. The note is required. */
export function decisionNoteError(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed === '') {
    return 'Indiquez le motif de la décision.';
  }
  if (trimmed.length > DECISION_NOTE_MAX_LENGTH) {
    return `Le motif ne doit pas dépasser ${DECISION_NOTE_MAX_LENGTH} caractères.`;
  }
  return null;
}

/** The French message for an answer that the API would refuse, or null when it is acceptable. */
export function supportReplyError(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 'Rédigez votre réponse.';
  }
  if (trimmed.length > SUPPORT_REPLY_MAX_LENGTH) {
    return `La réponse ne doit pas dépasser ${SUPPORT_REPLY_MAX_LENGTH} caractères.`;
  }
  return null;
}

/** The codes an administrator can pick to start the deletion of an account (owner decision 2026-10-21). */
export const DELETION_REASON_CODES = ['abuse', 'spam', 'harassment', 'identity_theft', 'other'] as const;
export type DeletionReasonCode = (typeof DELETION_REASON_CODES)[number];

/** The French label of each reason. The label is the reason written in the audit log and in the e-mail. */
const DELETION_REASON_LABELS: Record<DeletionReasonCode, string> = {
  abuse: 'Abus',
  spam: 'Spam',
  harassment: 'Harcèlement',
  identity_theft: 'Usurpation d’identité',
  other: 'Autre',
};

/**
 * The reason written for a deletion: the free text when the code is "Autre" and a text is given, otherwise the label
 * of the code. The DTO requires the text for "Autre", so the label of "Autre" is only a fallback.
 */
export function deletionReasonText(code: DeletionReasonCode, otherReason?: string): string {
  if (code === 'other' && otherReason !== undefined) {
    return otherReason;
  }
  return DELETION_REASON_LABELS[code];
}

import { REASON_MAX_LENGTH } from '@/lib/admin-suspension';
import type { DeletionReasonCode } from '@/lib/admin-api';

/** The French message for a deletion that the API would refuse, or null when it is acceptable. */
export function deletionReasonError(reasonCode: DeletionReasonCode | '', otherReason: string): string | null {
  if (reasonCode === '') {
    return 'Choisissez le motif de la suppression.';
  }
  if (reasonCode !== 'other') {
    return null;
  }
  const trimmed = otherReason.trim();
  if (trimmed === '') {
    return 'Précisez le motif de la suppression.';
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    return `Le motif ne doit pas dépasser ${REASON_MAX_LENGTH} caractères.`;
  }
  return null;
}

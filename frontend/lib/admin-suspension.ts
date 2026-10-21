import type { ApiProblem } from '@/lib/api-client';

/** Code of the refusal of a sensitive action that needs a current re-authentication (DEC-088, admin.guard.ts). */
export const REAUTH_REQUIRED_CODE = 'reauth_required';

/** The reason is kept on the account as its suspension reason, with the same limit as the API (DEC-081). */
export const REASON_MAX_LENGTH = 500;

/** True when the API refused the action only because the administrator must confirm their identity again. */
export function needsReauthentication(problem: ApiProblem): boolean {
  return problem.code === REAUTH_REQUIRED_CODE;
}

/** The French message for a suspension reason that the API would refuse, or null when it is acceptable. */
export function suspensionReasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed === '') {
    return 'Indiquez le motif de la suspension.';
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    return `Le motif ne doit pas dépasser ${REASON_MAX_LENGTH} caractères.`;
  }
  return null;
}

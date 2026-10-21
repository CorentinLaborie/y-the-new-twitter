/*
 * What the back-office login shows for each answer. The wording of the refusals comes from the API (Problem Details),
 * except the two steps of the form, which are written here.
 */

import type { ApiProblem } from '@/lib/api-client';

/** Shown when the password is right and the second factor is asked (POST /admin/login answers code_required). */
export const CODE_REQUIRED_MESSAGE = 'Saisissez le code de votre application d’authentification.';

/** Shown when the account has no second factor yet: the back-office cannot set one up from this screen. */
export const SETUP_REQUIRED_MESSAGE =
  'La double authentification n’est pas encore configurée pour ce compte. Cette étape n’est pas disponible depuis cet écran.';

export type AdminLoginFailure =
  { kind: 'locked'; retryAfterSeconds: number } | { kind: 'error'; message: string };

/**
 * A 429 is the lock after too many failures: the form is disabled until the Retry-After delay has passed. Any other
 * refusal keeps the form and shows the API message.
 */
export function adminLoginFailure(problem: ApiProblem): AdminLoginFailure {
  if (problem.status === 429) {
    return { kind: 'locked', retryAfterSeconds: problem.retryAfterSeconds ?? 0 };
  }
  return { kind: 'error', message: problem.detail };
}

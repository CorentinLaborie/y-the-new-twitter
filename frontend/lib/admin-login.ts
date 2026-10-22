/*
 * What the back-office login shows for each answer. The wording of the refusals comes from the API (Problem Details).
 */

import type { ApiProblem } from '@/lib/api-client';

type AdminLoginFailure = { kind: 'locked'; retryAfterSeconds: number } | { kind: 'error'; message: string };

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

import type { ApiProblem } from '@/lib/api-client';

/*
 * French texts of the API refusals that carry a stable `code` (Problem Details extension). When a problem has a
 * known code, its text comes from here, never from the API `detail` (which can be in English). A problem without a
 * code, or with an unknown one, keeps the behaviour of its screen (status-based text, or the API detail).
 * The four texts are the ones the pages already showed; csrf_invalid is the text of the CSRF refusal.
 */

export const UNVERIFIED_ACCOUNT_MESSAGE =
  'Votre compte n’est pas encore validé. Saisissez le code reçu par e-mail pour l’activer.';
const SUSPENDED_ACCOUNT_MESSAGE = 'Votre compte est suspendu.';
const PENDING_DELETION_ACCOUNT_MESSAGE = 'Votre compte est en attente de suppression.';
const CSRF_INVALID_MESSAGE = 'Jeton de sécurité absent ou invalide.';

const MESSAGES_BY_CODE = new Map<string, string>([
  ['account_pending_verification', UNVERIFIED_ACCOUNT_MESSAGE],
  ['account_suspended', SUSPENDED_ACCOUNT_MESSAGE],
  ['account_pending_deletion', PENDING_DELETION_ACCOUNT_MESSAGE],
  ['csrf_invalid', CSRF_INVALID_MESSAGE],
]);

/** The French text of the problem's code, or null when the problem has no known code (the caller falls back). */
export function messageForCode(problem: ApiProblem): string | null {
  return problem.code === undefined ? null : (MESSAGES_BY_CODE.get(problem.code) ?? null);
}

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

/**
 * The French text of a refusal without a known code, by its HTTP status (decision of 2026-10-27: the API detail is not
 * shown, it can be in English). The account messages keep their code (messageForCode).
 */
export function messageForStatus(problem: ApiProblem): string {
  switch (problem.status) {
    case 400:
      return 'Le texte n’a pas pu être envoyé. Vérifiez-le et réessayez.';
    case 401:
      return 'Connectez-vous pour publier.';
    case 403:
      return 'Votre compte ne peut pas publier pour le moment.';
    case 404:
      return 'Cette question n’est plus disponible.';
    case 409:
      return 'Cette action a déjà été faite ou la page a changé. Actualisez la page.';
    case 422:
      return 'Le texte ne peut pas être publié. Vérifiez sa longueur et que la conversation est ouverte.';
    case 429:
      return 'Trop de tentatives. Réessayez dans un moment.';
    default:
      return 'La publication a échoué. Réessayez.';
  }
}

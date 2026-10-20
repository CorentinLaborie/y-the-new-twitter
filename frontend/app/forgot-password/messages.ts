import type { ApiProblem } from '@/lib/api-client';

/** French messages for the forgot-password screens, from the status of the API answer (no raw API text). */

export const CONFIRMATION_MESSAGE = 'Si cette adresse peut être utilisée, un code vient de vous être envoyé.';

function retryMessage(retryAfterSeconds: number | undefined): string {
  if (!retryAfterSeconds) {
    return 'Réessayez plus tard.';
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return minutes === 1 ? 'Réessayez dans 1 minute.' : `Réessayez dans ${minutes} minutes.`;
}

function unreachableMessage(problem: ApiProblem): string | null {
  return problem.status === 0 ? 'Le serveur est injoignable. Réessayez dans quelques instants.' : null;
}

export function requestErrorMessage(problem: ApiProblem): string {
  const unreachable = unreachableMessage(problem);
  if (unreachable) {
    return unreachable;
  }
  if (problem.status === 429) {
    return `Trop de demandes. ${retryMessage(problem.retryAfterSeconds)}`;
  }
  return 'Une erreur est survenue. Réessayez.';
}

export function confirmErrorMessage(problem: ApiProblem): string {
  const unreachable = unreachableMessage(problem);
  if (unreachable) {
    return unreachable;
  }
  if (problem.status === 422) {
    return 'Le code est incorrect ou expiré, ou le mot de passe n’est pas accepté.';
  }
  if (problem.status === 429) {
    return `Trop de tentatives. ${retryMessage(problem.retryAfterSeconds)}`;
  }
  return 'Une erreur est survenue. Réessayez.';
}

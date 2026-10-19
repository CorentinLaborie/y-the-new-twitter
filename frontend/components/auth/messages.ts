import type { ApiProblem } from '@/lib/auth-api';

/*
 * French texts for the errors of the account API. The backend `detail` is not used: it can be in English
 * (class-validator defaults, "Unexpected error."), so the text comes from the status and the form.
 */

const UNVERIFIED_ACCOUNT_MESSAGE =
  'Votre compte n’est pas encore validé. Saisissez le code reçu par e-mail pour l’activer.';

const CONNECTION_ERROR_MESSAGE = 'Le serveur est injoignable. Réessayez dans un instant.';
const UNEXPECTED_ERROR_MESSAGE = 'Une erreur est survenue. Réessayez.';

/** Wait shown after a 429: "45 secondes", "1 minute", "15 minutes". Rounded up to the minute from 60 s. */
export function formatWait(seconds: number): string {
  if (seconds < 60) {
    return seconds <= 1 ? '1 seconde' : `${seconds} secondes`;
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function tooManyAttemptsMessage(problem: ApiProblem): string {
  return problem.retryAfterSeconds === undefined
    ? 'Trop de tentatives. Réessayez plus tard.'
    : `Trop de tentatives. Réessayez dans ${formatWait(problem.retryAfterSeconds)}.`;
}

function genericMessage(problem: ApiProblem): string {
  return problem.status === 0 ? CONNECTION_ERROR_MESSAGE : UNEXPECTED_ERROR_MESSAGE;
}

/** A message, and the field it belongs to when the error is about one field. */
type ProblemMessage<Field extends string = string> = { message: string; field?: Field };

export function signupProblemMessage(problem: ApiProblem): ProblemMessage<'handle'> {
  switch (problem.status) {
    case 409:
      return { field: 'handle', message: 'Cet identifiant existe déjà.' };
    case 400:
    case 422:
      return { message: 'Certaines informations ne sont pas acceptées. Vérifiez le formulaire.' };
    case 429:
      return { message: tooManyAttemptsMessage(problem) };
    default:
      return { message: genericMessage(problem) };
  }
}

export function loginProblemMessage(problem: ApiProblem): ProblemMessage {
  switch (problem.status) {
    case 401:
      return { message: 'Identifiants incorrects.' };
    case 403:
      return { message: UNVERIFIED_ACCOUNT_MESSAGE };
    case 429:
      return { message: tooManyAttemptsMessage(problem) };
    default:
      return { message: genericMessage(problem) };
  }
}

export function verifyProblemMessage(problem: ApiProblem): ProblemMessage<'code'> {
  switch (problem.status) {
    case 422:
      return { field: 'code', message: 'Le code est incorrect ou a expiré. Demandez un nouveau code.' };
    case 429:
      return { message: tooManyAttemptsMessage(problem) };
    default:
      return { message: genericMessage(problem) };
  }
}

export function resendProblemMessage(problem: ApiProblem): ProblemMessage {
  return problem.status === 429
    ? { message: tooManyAttemptsMessage(problem) }
    : { message: genericMessage(problem) };
}

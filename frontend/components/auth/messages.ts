import type { ApiProblem } from '@/lib/api-client';
import { messageForCode, UNVERIFIED_ACCOUNT_MESSAGE } from '@/lib/api-messages';

/*
 * French texts for the errors of the account API. The backend `detail` is not used: it can be in English
 * (class-validator defaults, "Unexpected error."), so the text comes from the code, or else from the status and the form.
 */

const CONNECTION_ERROR_MESSAGE = 'Le serveur est injoignable. Réessayez dans un instant.';
const UNEXPECTED_ERROR_MESSAGE = 'Une erreur est survenue. Réessayez.';

/**
 * Shown on the login page after a 401 of the protected area (lib/session-expired.ts). The product doc gives no text
 * for this state, so the text is provisional: to be validated by the owner (DEC-145, R8).
 */
export const SESSION_EXPIRED_MESSAGE = 'Votre session a expiré. Reconnectez-vous pour continuer.';

/** Wait shown after a 429: "45 secondes", "1 minute", "15 minutes". Rounded up to the minute from 60 s. */
export function formatWait(seconds: number): string {
  if (seconds < 60) {
    return seconds <= 1 ? '1 seconde' : `${seconds} secondes`;
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export function tooManyAttemptsMessage(problem: ApiProblem): string {
  return problem.retryAfterSeconds === undefined
    ? 'Trop de tentatives. Réessayez plus tard.'
    : `Trop de tentatives. Réessayez dans ${formatWait(problem.retryAfterSeconds)}.`;
}

function genericMessage(problem: ApiProblem): string {
  return problem.status === 0 ? CONNECTION_ERROR_MESSAGE : UNEXPECTED_ERROR_MESSAGE;
}

/** A message, and the field it belongs to when the error is about one field. */
type ProblemMessage<Field extends string = string> = { message: string; field?: Field };

/** The API answers a taken phone with a 409 whose message names the phone (signup.service.ts). */
const PHONE_CONFLICT = /t[ée]l[ée]phone/i;

export function signupProblemMessage(problem: ApiProblem): ProblemMessage<'handle' | 'phone'> {
  const coded = messageForCode(problem);
  if (coded) {
    return { message: coded };
  }
  switch (problem.status) {
    case 409:
      return PHONE_CONFLICT.test(problem.detail)
        ? { field: 'phone', message: 'Ce numéro de téléphone est déjà utilisé.' }
        : { field: 'handle', message: 'Cet identifiant existe déjà.' };
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
  const coded = messageForCode(problem);
  if (coded) {
    return { message: coded };
  }
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
  const coded = messageForCode(problem);
  if (coded) {
    return { message: coded };
  }
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
  const coded = messageForCode(problem);
  if (coded) {
    return { message: coded };
  }
  return problem.status === 429
    ? { message: tooManyAttemptsMessage(problem) }
    : { message: genericMessage(problem) };
}

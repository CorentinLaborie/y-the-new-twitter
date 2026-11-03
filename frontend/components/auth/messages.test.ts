import { describe, expect, it } from 'vitest';
import type { ApiProblem } from '@/lib/api-client';
import { loginProblemMessage, resendProblemMessage, signupProblemMessage, verifyProblemMessage } from './messages';

function problem(status: number, retryAfterSeconds?: number): ApiProblem {
  return { status, title: 'Error', detail: 'Server detail, possibly in English.', retryAfterSeconds };
}


describe('signup problems', () => {
  it('puts a taken handle on the handle field', () => {
    expect(signupProblemMessage(problem(409))).toEqual({
      field: 'handle',
      message: 'Cet identifiant existe déjà.',
    });
  });

  it('puts a phone already used on the phone field', () => {
    expect(
      signupProblemMessage({ ...problem(409), detail: 'Ce numéro de téléphone est déjà utilisé.' }),
    ).toEqual({
      field: 'phone',
      message: 'Ce numéro de téléphone est déjà utilisé.',
    });
  });

  it('shows the wait of a 429 from Retry-After', () => {
    expect(signupProblemMessage(problem(429, 3600)).message).toBe(
      'Trop de tentatives. Réessayez dans 60 minutes.',
    );
  });

  it('never shows the English detail of the server', () => {
    expect(signupProblemMessage(problem(400)).message).toBe(
      'Certaines informations ne sont pas acceptées. Vérifiez le formulaire.',
    );
    expect(signupProblemMessage(problem(500)).message).toBe('Une erreur est survenue. Réessayez.');
  });

  it('says the server cannot be reached when there is no answer', () => {
    expect(signupProblemMessage(problem(0)).message).toBe(
      'Le serveur est injoignable. Réessayez dans un instant.',
    );
  });
});

describe('login problems', () => {
  it('uses the generic credentials message for a 401', () => {
    expect(loginProblemMessage(problem(401))).toEqual({ message: 'Identifiants incorrects.' });
  });

  it('explains that an unverified account must enter its code for a 403', () => {
    expect(loginProblemMessage(problem(403)).message).toBe(
      'Votre compte n’est pas encore validé. Saisissez le code reçu par e-mail pour l’activer.',
    );
  });

  it('shows the Retry-After delay for a 429, or a plain message without it', () => {
    expect(loginProblemMessage(problem(429, 900)).message).toBe(
      'Trop de tentatives. Réessayez dans 15 minutes.',
    );
    expect(loginProblemMessage(problem(429)).message).toBe('Trop de tentatives. Réessayez plus tard.');
  });
});

describe('code problems', () => {
  it('puts a wrong or expired code on the code field', () => {
    expect(verifyProblemMessage(problem(422))).toEqual({
      field: 'code',
      message: 'Le code est incorrect ou a expiré. Demandez un nouveau code.',
    });
  });

  it('gives the wait for a resend that is too frequent', () => {
    expect(resendProblemMessage(problem(429, 90)).message).toBe(
      'Trop de tentatives. Réessayez dans 2 minutes.',
    );
    expect(resendProblemMessage(problem(0)).message).toBe(
      'Le serveur est injoignable. Réessayez dans un instant.',
    );
  });
});

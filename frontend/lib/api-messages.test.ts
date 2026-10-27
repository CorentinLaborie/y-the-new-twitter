import { describe, expect, it } from 'vitest';
import type { ApiProblem } from '@/lib/api-client';
import { messageForCode, messageForStatus, UNVERIFIED_ACCOUNT_MESSAGE } from './api-messages';

function problem(code?: string): ApiProblem {
  return { status: 403, title: 'Forbidden', detail: 'Server detail, possibly in English.', code };
}

describe('messageForCode', () => {
  it('gives the French text of each known code', () => {
    expect(messageForCode(problem('account_pending_verification'))).toBe(UNVERIFIED_ACCOUNT_MESSAGE);
    expect(messageForCode(problem('account_suspended'))).toBe('Votre compte est suspendu.');
    expect(messageForCode(problem('account_pending_deletion'))).toBe(
      'Votre compte est en attente de suppression.',
    );
    expect(messageForCode(problem('csrf_invalid'))).toBe('Jeton de sécurité absent ou invalide.');
  });

  it('gives nothing without a code, or with a code the page does not know', () => {
    expect(messageForCode(problem())).toBeNull();
    expect(messageForCode(problem('unknown_code'))).toBeNull();
    expect(messageForCode(problem('constructor'))).toBeNull();
  });

  it('gives a French text by status for a refusal without a known code, never the API detail (decision 2026-10-27)', () => {
    const byStatus = (status: number) => messageForStatus({ status, title: 'x', detail: 'Too long, in English' } as never);

    expect(byStatus(422)).toBe('Le texte ne peut pas être publié. Vérifiez sa longueur et que la conversation est ouverte.');
    expect(byStatus(429)).toBe('Trop de tentatives. Réessayez dans un moment.');
    expect(byStatus(500)).toBe('La publication a échoué. Réessayez.');
    expect(byStatus(422)).not.toContain('English');
  });
});

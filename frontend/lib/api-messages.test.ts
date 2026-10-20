import { describe, expect, it } from 'vitest';
import type { ApiProblem } from '@/lib/api-client';
import { messageForCode, UNVERIFIED_ACCOUNT_MESSAGE } from './api-messages';

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
});

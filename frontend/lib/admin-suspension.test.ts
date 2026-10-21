import { describe, expect, it } from 'vitest';
import { needsReauthentication, REASON_MAX_LENGTH, suspensionReasonError } from '@/lib/admin-suspension';

describe('needsReauthentication', () => {
  it('is true for the refusal that asks for a re-authentication', () => {
    expect(
      needsReauthentication({ status: 403, title: 'Interdit', detail: 'Ré-authentification requise.', code: 'reauth_required' }),
    ).toBe(true);
  });

  it('is false for any other refusal, with or without a code', () => {
    expect(needsReauthentication({ status: 403, title: 'Interdit', detail: 'Accès refusé.' })).toBe(false);
    expect(needsReauthentication({ status: 403, title: 'Interdit', detail: 'Csrf.', code: 'csrf_invalid' })).toBe(false);
  });
});

describe('suspensionReasonError', () => {
  it('asks for a reason when it is empty or only spaces', () => {
    expect(suspensionReasonError('')).toBe('Indiquez le motif de la suspension.');
    expect(suspensionReasonError('   ')).toBe('Indiquez le motif de la suspension.');
  });

  it('accepts a reason up to the limit, and refuses one more character', () => {
    expect(suspensionReasonError('a'.repeat(REASON_MAX_LENGTH))).toBeNull();
    expect(suspensionReasonError('a'.repeat(REASON_MAX_LENGTH + 1))).toBe(
      `Le motif ne doit pas dépasser ${REASON_MAX_LENGTH} caractères.`,
    );
  });

  it('counts the limit without the spaces around the reason', () => {
    expect(suspensionReasonError(`  ${'a'.repeat(REASON_MAX_LENGTH)}  `)).toBeNull();
  });
});
